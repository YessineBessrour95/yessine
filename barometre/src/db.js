'use strict';

const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS campaigns (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      headcount  INTEGER,
      active     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS responses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      service     TEXT,
      seniority   TEXT,
      status      TEXT,
      comment     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS answers (
      response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      value       INTEGER NOT NULL CHECK (value BETWEEN 0 AND 5),
      PRIMARY KEY (response_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_responses_campaign ON responses(campaign_id);
  `);

  const repo = {
    listCampaigns() {
      return db.prepare(`
        SELECT c.id, c.name, c.headcount, c.active, c.created_at,
               (SELECT COUNT(*) FROM responses r WHERE r.campaign_id = c.id) AS responses
        FROM campaigns c ORDER BY c.id
      `).all().map((c) => ({ ...c, active: Boolean(c.active) }));
    },

    getCampaign(id) {
      const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
      return c ? { ...c, active: Boolean(c.active) } : null;
    },

    getActiveCampaign() {
      const c = db.prepare('SELECT * FROM campaigns WHERE active = 1').get();
      return c ? { ...c, active: true } : null;
    },

    // Campagne précédente (la plus récente créée avant celle-ci), pour mesurer l'évolution.
    getPreviousCampaign(id) {
      return db.prepare('SELECT * FROM campaigns WHERE id < ? ORDER BY id DESC LIMIT 1').get(id) || null;
    },

    createCampaign({ name, headcount }) {
      const { lastInsertRowid } = db.prepare('INSERT INTO campaigns (name, headcount) VALUES (?, ?)')
        .run(name, headcount ?? null);
      return Number(lastInsertRowid);
    },

    // Ne met à jour que les champs fournis (undefined = inchangé).
    updateCampaign(id, fields) {
      if (fields.name !== undefined) db.prepare('UPDATE campaigns SET name = ? WHERE id = ?').run(fields.name, id);
      if (fields.headcount !== undefined) db.prepare('UPDATE campaigns SET headcount = ? WHERE id = ?').run(fields.headcount, id);
    },

    setActiveCampaign(id) {
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE campaigns SET active = 0').run();
        if (id != null) db.prepare('UPDATE campaigns SET active = 1 WHERE id = ?').run(id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    insertResponse(campaignId, { demographics, answers, comment }) {
      db.exec('BEGIN');
      try {
        const { lastInsertRowid } = db.prepare(
          'INSERT INTO responses (campaign_id, service, seniority, status, comment) VALUES (?, ?, ?, ?, ?)'
        ).run(campaignId, demographics.service ?? null, demographics.seniority ?? null,
          demographics.status ?? null, comment ?? null);
        const insertAnswer = db.prepare('INSERT INTO answers (response_id, question_id, value) VALUES (?, ?, ?)');
        for (const [questionId, value] of Object.entries(answers)) {
          insertAnswer.run(lastInsertRowid, questionId, value);
        }
        db.exec('COMMIT');
        return Number(lastInsertRowid);
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Renvoie les réponses d'une campagne sous forme { id, service, seniority, status, comment, created_at, answers: { q1: 4, ... } }.
    getResponses(campaignId) {
      const responses = db.prepare(
        'SELECT id, service, seniority, status, comment, created_at FROM responses WHERE campaign_id = ? ORDER BY id'
      ).all(campaignId);
      const byId = new Map(responses.map((r) => [r.id, { ...r, answers: {} }]));
      const rows = db.prepare(`
        SELECT a.response_id, a.question_id, a.value
        FROM answers a JOIN responses r ON r.id = a.response_id
        WHERE r.campaign_id = ?
      `).all(campaignId);
      for (const row of rows) byId.get(row.response_id).answers[row.question_id] = row.value;
      return [...byId.values()];
    },

    close() {
      db.close();
    },
  };

  return repo;
}

module.exports = { openDb };
