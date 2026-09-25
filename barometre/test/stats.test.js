'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { QUESTIONS } = require('../src/questions');
const stats = require('../src/stats');

const answersAll = (value) => Object.fromEntries(QUESTIONS.map((q) => [q.id, value]));

test('le référentiel contient 40 questions réparties en 8 dimensions de 5', () => {
  assert.equal(QUESTIONS.length, 40);
  const perDim = {};
  for (const q of QUESTIONS) perDim[q.dimension] = (perDim[q.dimension] || 0) + 1;
  assert.deepEqual(Object.values(perDim), [5, 5, 5, 5, 5, 5, 5, 5]);
});

test('les questions inversées sont réorientées', () => {
  const reversed = QUESTIONS.find((q) => q.reverse);
  assert.equal(stats.adjusted(reversed, 1), 5);
  assert.equal(stats.adjusted(reversed, 0), null);
});

test('scores sur 100, % favorables et exclusion des « ne se prononce pas »', () => {
  const responses = [
    { answers: answersAll(5) },
    { answers: answersAll(3) },
    { answers: answersAll(0) },
  ];
  const r = stats.computeResults(responses);
  const direct = r.questions.find((q) => !q.reverse);
  assert.equal(direct.n, 2);
  assert.equal(direct.nsp, 1);
  assert.equal(direct.score, 75); // moyenne 4 -> 75/100
  assert.equal(direct.favorable, 50);
  const reversed = r.questions.find((q) => q.reverse);
  assert.equal(reversed.score, 25); // 5 inversé = 1, 3 = 3 -> moyenne 2
});

test('validation des réponses envoyées', () => {
  assert.throws(() => stats.validateSubmission({ answers: {} }), /question 1/);
  assert.throws(() => stats.validateSubmission({ answers: answersAll(6) }), /invalide/);
  assert.throws(() => stats.validateSubmission({ answers: answersAll(4), demographics: { service: 'Inconnu' } }), /service/);
  const ok = stats.validateSubmission({ answers: answersAll(4), demographics: { service: 'Finance' }, comment: '  bien  ' });
  assert.equal(ok.comment, 'bien');
  assert.equal(ok.demographics.service, 'Finance');
});

test('export CSV avec échappement', () => {
  const csv = stats.toCsv([{ id: 1, created_at: 'x', service: 'Finance', answers: answersAll(4), comment: 'a;"b"' }]);
  assert.match(csv, /"a;""b"""/);
  assert.equal(csv.trim().split('\r\n').length, 2);
});
