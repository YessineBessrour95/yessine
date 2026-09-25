'use strict';

// Génère des données fictives (2 campagnes) pour tester le tableau de bord : npm run seed
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('../src/db');
const { QUESTIONS, DEMOGRAPHICS } = require('../src/questions');

const dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'barometre.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = openDb(dbFile);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Tendance propre à chaque dimension pour obtenir des résultats contrastés.
const bias = { sens: 0.8, charge: -0.6, management: 0.4, equipe: 0.9, reconnaissance: -0.9, developpement: -0.2, equilibre: -0.3, direction: -0.5 };

function fakeAnswer(q, shift) {
  if (Math.random() < 0.04) return 0;
  const target = 3.2 + bias[q.dimension] + shift + (Math.random() - 0.5) * 2.4;
  const v = Math.min(5, Math.max(1, Math.round(target)));
  return q.reverse ? 6 - v : v;
}

const comments = [
  'Il faudrait plus de visibilité sur les perspectives d’évolution.',
  'Très bonne ambiance dans l’équipe, merci !',
  'La charge de travail est trop importante en fin de mois.',
  'Plus de télétravail serait apprécié.',
  'Les outils informatiques mériteraient d’être modernisés.',
];

function seedCampaign(name, headcount, count, shift) {
  const id = db.createCampaign({ name, headcount });
  for (let i = 0; i < count; i++) {
    db.insertResponse(id, {
      answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, fakeAnswer(q, shift)])),
      demographics: Object.fromEntries(DEMOGRAPHICS.map((d) => [d.id, Math.random() < 0.9 ? pick(d.options.slice(0, 6)) : undefined])),
      comment: Math.random() < 0.2 ? pick(comments) : null,
    });
  }
  return id;
}

seedCampaign('Baromètre démo 2025', 150, 90, -0.2);
const last = seedCampaign('Baromètre démo 2026', 150, 110, 0.1);
db.setActiveCampaign(last);
db.close();
console.log(`Données de démonstration ajoutées dans ${dbFile}`);
