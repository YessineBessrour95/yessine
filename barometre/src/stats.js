'use strict';

const { DIMENSIONS, QUESTIONS, DEMOGRAPHICS, ANONYMITY_THRESHOLD } = require('./questions');

// Valeur « orientée positivement » : 5 est toujours le meilleur score. null si « ne se prononce pas ».
function adjusted(question, value) {
  if (!value) return null;
  return question.reverse ? 6 - value : value;
}

// Moyenne 1..5 ramenée sur 100.
function toScore100(mean) {
  return mean == null ? null : round1(((mean - 1) / 4) * 100);
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function questionStats(question, responses) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let nsp = 0;
  let sum = 0;
  let n = 0;
  for (const r of responses) {
    const v = adjusted(question, r.answers[question.id]);
    if (v == null) {
      if (r.answers[question.id] === 0) nsp += 1;
      continue;
    }
    distribution[v] += 1;
    sum += v;
    n += 1;
  }
  const mean = n ? sum / n : null;
  return {
    id: question.id,
    dimension: question.dimension,
    text: question.text,
    reverse: question.reverse,
    n,
    nsp,
    mean: mean == null ? null : Math.round(mean * 100) / 100,
    score: toScore100(mean),
    favorable: n ? round1(((distribution[4] + distribution[5]) / n) * 100) : null,
    unfavorable: n ? round1(((distribution[1] + distribution[2]) / n) * 100) : null,
    distribution, // exprimée sur l'échelle orientée positivement
  };
}

function average(values) {
  const valid = values.filter((v) => v != null);
  return valid.length ? round1(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
}

// Calcule les résultats (scores par question, par dimension et indice global) d'un ensemble de réponses.
function computeResults(responses) {
  const questions = QUESTIONS.map((q) => questionStats(q, responses));
  const dimensions = DIMENSIONS.map((dim) => {
    const qs = questions.filter((q) => q.dimension === dim.id);
    return {
      id: dim.id,
      label: dim.label,
      score: average(qs.map((q) => q.score)),
      favorable: average(qs.map((q) => q.favorable)),
    };
  });
  return {
    respondents: responses.length,
    globalIndex: average(dimensions.map((d) => d.score)),
    globalFavorable: average(dimensions.map((d) => d.favorable)),
    dimensions,
    questions,
  };
}

function applyFilters(responses, filters = {}) {
  return responses.filter((r) => DEMOGRAPHICS.every((d) => !filters[d.id] || r[d.id] === filters[d.id]));
}

// Répartition des répondants par critère de profil (les petits groupes sont masqués).
function breakdown(responses) {
  const result = {};
  for (const d of DEMOGRAPHICS) {
    result[d.id] = d.options.map((option) => {
      const group = responses.filter((r) => r[d.id] === option);
      const visible = group.length >= ANONYMITY_THRESHOLD;
      return {
        option,
        respondents: visible ? group.length : null,
        globalIndex: visible ? computeResults(group).globalIndex : null,
      };
    });
  }
  return result;
}

// Ajoute l'écart avec la campagne précédente à chaque indicateur.
function withEvolution(current, previous) {
  if (!previous || previous.respondents < ANONYMITY_THRESHOLD) return current;
  const delta = (a, b) => (a == null || b == null ? null : round1(a - b));
  const prevDims = new Map(previous.dimensions.map((d) => [d.id, d]));
  const prevQs = new Map(previous.questions.map((q) => [q.id, q]));
  return {
    ...current,
    globalIndexDelta: delta(current.globalIndex, previous.globalIndex),
    dimensions: current.dimensions.map((d) => ({
      ...d,
      previousScore: prevDims.get(d.id).score,
      delta: delta(d.score, prevDims.get(d.id).score),
    })),
    questions: current.questions.map((q) => ({
      ...q,
      previousScore: prevQs.get(q.id).score,
      delta: delta(q.score, prevQs.get(q.id).score),
    })),
  };
}

// Points forts / points de vigilance : questions triées par score.
function highlights(results, count = 5) {
  const scored = results.questions.filter((q) => q.score != null);
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const pick = (q) => ({ id: q.id, text: q.text, reverse: q.reverse, score: q.score, favorable: q.favorable });
  return {
    strengths: sorted.slice(0, count).map(pick),
    weaknesses: sorted.slice(-count).reverse().map(pick),
  };
}

// Valide et normalise une réponse envoyée par le formulaire. Lève une erreur si elle est invalide.
function validateSubmission(body) {
  if (!body || typeof body !== 'object') throw new Error('Corps de requête invalide.');
  const answers = {};
  for (const q of QUESTIONS) {
    const v = body.answers?.[q.id];
    if (!Number.isInteger(v) || v < 0 || v > 5) {
      throw new Error(`Réponse manquante ou invalide pour la question ${q.id.slice(1)}.`);
    }
    answers[q.id] = v;
  }
  const demographics = {};
  for (const d of DEMOGRAPHICS) {
    const v = body.demographics?.[d.id];
    if (v == null || v === '') continue;
    if (!d.options.includes(v)) throw new Error(`Valeur invalide pour « ${d.label} ».`);
    demographics[d.id] = v;
  }
  let comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (comment.length > 2000) comment = comment.slice(0, 2000);
  return { answers, demographics, comment: comment || null };
}

function toCsv(responses) {
  const header = ['id', 'date', ...DEMOGRAPHICS.map((d) => d.id), ...QUESTIONS.map((q) => q.id), 'commentaire'];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(';')];
  for (const r of responses) {
    lines.push([
      r.id,
      r.created_at,
      ...DEMOGRAPHICS.map((d) => r[d.id]),
      ...QUESTIONS.map((q) => r.answers[q.id]),
      r.comment,
    ].map(esc).join(';'));
  }
  // BOM pour qu'Excel détecte l'UTF-8 (accents).
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = {
  adjusted,
  computeResults,
  applyFilters,
  breakdown,
  withEvolution,
  highlights,
  validateSubmission,
  toCsv,
};
