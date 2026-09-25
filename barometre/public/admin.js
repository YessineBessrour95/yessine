'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'barometre-admin-token';
  const session = {
    get() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(TOKEN_KEY, v); } catch { /* indisponible */ } },
    clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* indisponible */ } },
  };

  let token = session.get();
  let config;
  let campaigns = [];
  const filters = {};

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, suffix = '') => (v == null ? '–' : `${String(v).replace('.', ',')}${suffix}`);
  const level = (score) => (score == null ? '' : score >= 66 ? 'lvl-good' : score >= 50 ? 'lvl-warn' : 'lvl-bad');

  function deltaHtml(delta) {
    if (delta == null) return '';
    const cls = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
    const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '=';
    return `<span class="delta ${cls}" title="Évolution par rapport à la campagne précédente">${arrow} ${fmt(delta > 0 ? `+${delta}` : delta)}</span>`;
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) {
      logout();
      throw new Error('Session expirée ou jeton invalide.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  function logout() {
    token = null;
    session.clear();
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
  }

  // --- Radar SVG --------------------------------------------------------------
  function radarSvg(dimensions) {
    const width = 540;
    const height = 400;
    const cx = width / 2;
    const cy = height / 2;
    const r = 125;
    const n = dimensions.length;
    const point = (i, value) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const d = (r * value) / 100;
      return [cx + d * Math.cos(angle), cy + d * Math.sin(angle)];
    };
    const polygon = (values) => values.map((v, i) => point(i, v ?? 0).map((x) => x.toFixed(1)).join(',')).join(' ');
    let svg = `<svg class="radar" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Radar des scores par dimension">`;
    for (const ring of [25, 50, 75, 100]) {
      svg += `<polygon points="${polygon(dimensions.map(() => ring))}" fill="none" stroke="var(--border)"/>`;
    }
    dimensions.forEach((d, i) => {
      const [x, y] = point(i, 100);
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)"/>`;
      const [lx, ly] = point(i, 122);
      const anchor = Math.abs(lx - cx) < 10 ? 'middle' : lx > cx ? 'start' : 'end';
      const words = d.label.split(' ');
      const lines = [];
      for (const w of words) {
        if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= 18) lines[lines.length - 1] += ` ${w}`;
        else lines.push(w);
      }
      svg += `<text x="${lx}" y="${ly - ((lines.length - 1) * 6)}" text-anchor="${anchor}">${lines.map((l, k) => `<tspan x="${lx}" dy="${k ? 12 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
    });
    if (dimensions.some((d) => d.previousScore != null)) {
      svg += `<polygon points="${polygon(dimensions.map((d) => d.previousScore))}" fill="none" stroke="var(--muted)" stroke-dasharray="4 3" stroke-width="1.5"/>`;
    }
    svg += `<polygon points="${polygon(dimensions.map((d) => d.score))}" fill="var(--primary)" fill-opacity=".18" stroke="var(--primary)" stroke-width="2"/>`;
    dimensions.forEach((d, i) => {
      const [x, y] = point(i, d.score ?? 0);
      svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--primary)"><title>${esc(d.label)} : ${fmt(d.score)}</title></circle>`;
    });
    svg += '</svg>';
    return svg;
  }

  // --- Rendu des résultats ----------------------------------------------------
  function renderKpis(data) {
    const sub = (text) => `<div class="muted" style="font-size:.8rem">${text}</div>`;
    const kpis = [
      { label: 'Indice global de satisfaction (/100)', value: fmt(data.globalIndex), delta: deltaHtml(data.globalIndexDelta),
        sub: data.previousCampaign ? sub(`vs ${esc(data.previousCampaign.name)}`) : '' },
      { label: 'Réponses favorables (moyenne)', value: fmt(data.globalFavorable, ' %') },
      { label: Object.keys(data.filters).length ? 'Répondants (filtre actif)' : 'Répondants', value: data.respondents },
      { label: 'Taux de participation', value: fmt(data.participationRate, ' %'),
        sub: sub(data.campaign.headcount ? `${data.totalRespondents} / ${data.campaign.headcount} salariés` : 'Effectif non renseigné') },
    ];
    $('kpis').innerHTML = kpis.map((k) => `
      <div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}${k.delta || ''}</div>${k.sub || ''}</div>`).join('');
  }

  function renderDimensions(data) {
    $('radar').innerHTML = radarSvg(data.dimensions)
      + (data.previousCampaign ? `<p class="muted" style="font-size:.8rem">Trait plein : campagne sélectionnée. Pointillés : ${esc(data.previousCampaign.name)}.</p>` : '');
    $('dimbars').innerHTML = data.dimensions.map((d) => `
      <div class="dimbar">
        <div class="head"><span>${esc(d.label)}</span><span><strong>${fmt(d.score)}</strong>${deltaHtml(d.delta)}
          <span class="muted"> · ${fmt(d.favorable, ' % fav.')}</span></span></div>
        <div class="bar"><div class="${level(d.score)}" style="width:${d.score ?? 0}%"></div></div>
      </div>`).join('');
  }

  function renderHighlights(data) {
    const item = (q) => `<li><span>${esc(q.text)}${q.reverse ? ' <span class="muted">(*)</span>' : ''}</span><strong class="${level(q.score).replace('lvl-', 'txt-')}">${fmt(q.score)}</strong></li>`;
    $('strengths').innerHTML = data.highlights.strengths.map(item).join('');
    $('weaknesses').innerHTML = data.highlights.weaknesses.map(item).join('');
  }

  function renderQuestions(data) {
    let html = `<thead><tr><th>#</th><th>Question</th><th>Répartition</th><th class="num">Score</th><th class="num">% fav.</th><th class="num">NSP</th></tr></thead><tbody>`;
    for (const dim of data.dimensions) {
      html += `<tr class="dimrow"><td colspan="3">${esc(dim.label)}</td><td class="num">${fmt(dim.score)}</td><td class="num">${fmt(dim.favorable, ' %')}</td><td></td></tr>`;
      for (const q of data.questions.filter((x) => x.dimension === dim.id)) {
        const stack = q.n
          ? [1, 2, 3, 4, 5].map((v) => `<span style="width:${(q.distribution[v] / q.n) * 100}%" title="${Math.round((q.distribution[v] / q.n) * 100)} %"></span>`).join('')
          : '';
        html += `<tr>
          <td class="muted">${q.id.slice(1)}</td>
          <td>${esc(q.text)}${q.reverse ? ' <span class="muted">(*)</span>' : ''}</td>
          <td><div class="stack">${stack}</div></td>
          <td class="num"><strong>${fmt(q.score)}</strong>${deltaHtml(q.delta)}</td>
          <td class="num">${fmt(q.favorable, ' %')}</td>
          <td class="num muted">${q.nsp}</td></tr>`;
      }
    }
    $('qtable').innerHTML = `${html}</tbody>`;
  }

  function renderBreakdown(data) {
    $('breakdown').innerHTML = config.demographics.map((d) => `
      <div>
        <h3>${esc(d.label.replace(/^Votre /, '').replace(/^./, (c) => c.toUpperCase()))}</h3>
        <ul class="plain">${data.breakdown[d.id].map((g) => `
          <li><span>${esc(g.option)}</span>
            <span>${g.respondents == null ? `<span class="muted">&lt; ${data.threshold} répondants</span>`
              : `<strong>${fmt(g.globalIndex)}</strong> <span class="muted">(${g.respondents})</span>`}</span></li>`).join('')}
        </ul>
      </div>`).join('');
  }

  function renderComments(data) {
    $('comments-count').textContent = `(${data.comments.length})`;
    $('comments').innerHTML = data.comments.length
      ? data.comments.map((c) => `<li>${esc(c)}</li>`).join('')
      : '<li class="muted">Aucun commentaire.</li>';
  }

  async function loadResults() {
    const params = new URLSearchParams({ campaign: $('campaign').value, ...filters });
    let data;
    try {
      data = await api(`/api/admin/results?${params}`);
    } catch (err) {
      $('hidden-msg').textContent = err.message;
      $('hidden-msg').classList.remove('hidden');
      $('results').classList.add('hidden');
      return;
    }
    if (data.hidden) {
      $('hidden-msg').innerHTML = `<strong>Résultats masqués.</strong> Ce groupe compte ${data.respondents} répondant(s) ;
        pour garantir l'anonymat, les résultats ne sont affichés qu'à partir de ${data.threshold} répondants.`;
      $('hidden-msg').classList.remove('hidden');
      $('results').classList.add('hidden');
      return;
    }
    $('hidden-msg').classList.add('hidden');
    $('results').classList.remove('hidden');
    renderKpis(data);
    renderDimensions(data);
    renderHighlights(data);
    renderQuestions(data);
    renderBreakdown(data);
    renderComments(data);
  }

  // --- Campagnes ----------------------------------------------------------------
  function renderCampaigns() {
    const selected = $('campaign').value;
    $('campaign').innerHTML = campaigns.slice().reverse().map((c) => `
      <option value="${c.id}">${esc(c.name)}${c.active ? ' (en cours)' : ''}</option>`).join('');
    const active = campaigns.find((c) => c.active);
    $('campaign').value = campaigns.some((c) => String(c.id) === selected) ? selected : String((active || campaigns[campaigns.length - 1])?.id ?? '');

    $('campaigns').innerHTML = `<thead><tr><th>Campagne</th><th>Créée le</th><th class="num">Réponses</th><th class="num">Effectif</th><th>Statut</th><th></th></tr></thead><tbody>
      ${campaigns.map((c) => `<tr>
        <td>${esc(c.name)}</td>
        <td>${new Date(`${c.created_at.replace(' ', 'T')}Z`).toLocaleDateString('fr-FR')}</td>
        <td class="num">${c.responses}</td>
        <td class="num"><input type="number" min="1" value="${c.headcount ?? ''}" data-headcount="${c.id}" style="width:100px" aria-label="Effectif"></td>
        <td>${c.active ? '<span class="badge">Ouverte</span>' : '<span class="muted">Fermée</span>'}</td>
        <td class="num"><button class="secondary" data-toggle="${c.id}">${c.active ? 'Fermer' : 'Ouvrir'}</button></td>
      </tr>`).join('')}</tbody>`;
  }

  async function loadCampaigns() {
    campaigns = await api('/api/admin/campaigns');
    renderCampaigns();
  }

  async function campaignAction(fn) {
    $('campaign-error').classList.add('hidden');
    try {
      await fn();
      await loadCampaigns();
      await loadResults();
    } catch (err) {
      $('campaign-error').textContent = err.message;
      $('campaign-error').classList.remove('hidden');
    }
  }

  function renderFilters() {
    $('filters').innerHTML = config.demographics.map((d) => `
      <div>
        <label for="f-${d.id}">${esc(d.label.replace(/^Votre /, '').replace(/^./, (c) => c.toUpperCase()))}</label>
        <select id="f-${d.id}" data-filter="${d.id}">
          <option value="">Tous</option>
          ${d.options.map((o) => `<option>${esc(o)}</option>`).join('')}
        </select>
      </div>`).join('');
  }

  async function exportCsv() {
    const res = await fetch(`/api/admin/export.csv?campaign=${$('campaign').value}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'barometre.csv';
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function start() {
    try {
      await loadCampaigns();
    } catch (err) {
      $('login-error').textContent = err.message;
      $('login-error').classList.remove('hidden');
      return;
    }
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    await loadResults();
  }

  function bindEvents() {
    $('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      token = $('token').value.trim();
      session.set(token);
      $('login-error').classList.add('hidden');
      start();
    });
    $('logout').addEventListener('click', logout);
    $('export').addEventListener('click', exportCsv);
    $('campaign').addEventListener('change', loadResults);
    $('filters').addEventListener('change', (e) => {
      const key = e.target.dataset.filter;
      if (e.target.value) filters[key] = e.target.value;
      else delete filters[key];
      loadResults();
    });
    $('new-campaign').addEventListener('submit', (e) => {
      e.preventDefault();
      campaignAction(async () => {
        const created = await api('/api/admin/campaigns', {
          method: 'POST',
          body: JSON.stringify({ name: $('nc-name').value, headcount: $('nc-headcount').value || null }),
        });
        $('nc-name').value = '';
        $('nc-headcount').value = '';
        $('campaign').value = String(created.id);
      });
    });
    $('campaigns').addEventListener('click', (e) => {
      const id = e.target.dataset.toggle;
      if (!id) return;
      const c = campaigns.find((x) => String(x.id) === id);
      campaignAction(() => api(`/api/admin/campaigns/${id}`, { method: 'POST', body: JSON.stringify({ active: !c.active }) }));
    });
    $('campaigns').addEventListener('change', (e) => {
      const id = e.target.dataset.headcount;
      if (!id) return;
      campaignAction(() => api(`/api/admin/campaigns/${id}`, { method: 'POST', body: JSON.stringify({ headcount: e.target.value || null }) }));
    });
  }

  async function init() {
    config = await (await fetch('/api/questionnaire')).json();
    renderFilters();
    bindEvents();
    if (token) start();
  }

  init();
})();
