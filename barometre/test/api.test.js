'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDb } = require('../src/db');
const { QUESTIONS } = require('../src/questions');
const { createApp } = require('../server');

const TOKEN = 'secret-test';

async function withServer(fn) {
  const db = openDb(':memory:');
  db.setActiveCampaign(db.createCampaign({ name: '2025', headcount: 20 }));
  const server = http.createServer(createApp({ db, adminToken: TOKEN }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, admin } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: `Bearer ${TOKEN}` } : {}) },
      body: body && JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  try {
    await fn(call);
  } finally {
    server.close();
    db.close();
  }
}

const submission = (value, service = 'Finance') => ({
  answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, value])),
  demographics: { service },
});

test('parcours complet : questionnaire, réponses, résultats, évolution', () => withServer(async (call) => {
  const q = await call('/api/questionnaire');
  assert.equal(q.data.questions.length, 40);
  assert.equal(q.data.campaign.name, '2025');

  assert.equal((await call('/api/responses', { method: 'POST', body: { answers: {} } })).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await call('/api/responses', { method: 'POST', body: submission(3) })).status, 201);

  assert.equal((await call('/api/admin/results')).status, 401);
  let res = await call('/api/admin/results', { admin: true });
  assert.equal(res.data.hidden, true); // 4 < seuil d'anonymat

  await call('/api/responses', { method: 'POST', body: submission(3, 'Commercial') });
  res = await call('/api/admin/results', { admin: true });
  assert.equal(res.data.hidden, false);
  assert.equal(res.data.respondents, 5);
  assert.equal(res.data.participationRate, 25);
  assert.equal(res.data.globalIndex, 50);
  assert.equal((await call('/api/admin/results?service=Commercial', { admin: true })).data.hidden, true);

  // Nouvelle campagne : l'évolution est calculée par rapport à la précédente.
  const created = await call('/api/admin/campaigns', { method: 'POST', admin: true, body: { name: '2026' } });
  assert.equal(created.status, 201);
  for (let i = 0; i < 5; i++) await call('/api/responses', { method: 'POST', body: submission(4) });
  res = await call('/api/admin/results', { admin: true });
  assert.equal(res.data.campaign.name, '2026');
  // 5 dimensions à 75, 3 dimensions contenant une question inversée (répondue 4 -> 25) à 65.
  assert.equal(res.data.globalIndex, 71.3);
  assert.equal(res.data.globalIndexDelta, 21.3);
  assert.ok(res.data.globalIndexDelta != null);
  assert.equal(res.data.previousCampaign.name, '2025');

  // Mise à jour partielle : changer l'effectif ne modifie pas le nom.
  await call(`/api/admin/campaigns/${created.data.id}`, { method: 'POST', admin: true, body: { headcount: 10 } });
  const list = (await call('/api/admin/campaigns', { admin: true })).data;
  assert.equal(list[1].name, '2026');
  assert.equal(list[1].headcount, 10);

  const csv = await call(`/api/admin/export.csv?campaign=${created.data.id}`, { admin: true });
  assert.equal(csv.data.trim().split('\r\n').length, 6);

  // Fermer la campagne bloque les nouvelles réponses.
  await call(`/api/admin/campaigns/${created.data.id}`, { method: 'POST', admin: true, body: { active: false } });
  assert.equal((await call('/api/responses', { method: 'POST', body: submission(4) })).status, 409);
}));

test('pas de traversée de répertoire sur les fichiers statiques', () => withServer(async (call) => {
  assert.equal((await call('/../server.js')).status, 404);
  assert.equal((await call('/%2e%2e/server.js')).status, 404);
  assert.equal((await call('/')).status, 200);
}));
