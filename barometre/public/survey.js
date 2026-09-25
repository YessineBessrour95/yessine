'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* idem */ } },
  };

  let config;
  let pages = [];
  let pageIndex = 0;
  let draftKey;
  let state = { answers: {}, demographics: {}, comment: '' };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildPages() {
    pages = config.dimensions.map((dim) => ({
      type: 'questions',
      title: dim.label,
      questions: config.questions.filter((q) => q.dimension === dim.id),
    }));
    pages.push({ type: 'profile', title: 'Pour finir : votre profil (facultatif)' });
  }

  function renderQuestion(q) {
    const num = q.id.slice(1);
    const options = config.scale.map((s) => `
      <label class="${s.value === 0 ? 'nsp' : ''}">
        <input type="radio" name="${q.id}" value="${s.value}" ${state.answers[q.id] === s.value ? 'checked' : ''}>
        <span>${escapeHtml(s.label)}</span>
      </label>`).join('');
    return `
      <fieldset class="question" id="block-${q.id}" style="border:0;margin:0;padding-left:0;padding-right:0">
        <legend class="qtext"><span class="qnum">${num}.</span>${escapeHtml(q.text)}</legend>
        <div class="scale" role="radiogroup">${options}</div>
      </fieldset>`;
  }

  function renderProfile() {
    const selects = config.demographics.map((d) => `
      <div>
        <label for="demo-${d.id}">${escapeHtml(d.label)}</label>
        <select id="demo-${d.id}" data-demo="${d.id}">
          <option value="">— Je préfère ne pas répondre —</option>
          ${d.options.map((o) => `<option ${state.demographics[d.id] === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
        </select>
      </div>`).join('');
    return `
      <p class="muted">Ces informations servent uniquement à analyser les résultats par groupe de 5 personnes minimum.</p>
      <div class="row">${selects}</div>
      <div style="margin-top:16px">
        <label for="comment">Avez-vous des remarques ou suggestions pour améliorer la qualité de vie au travail ?</label>
        <textarea id="comment" maxlength="2000" placeholder="Évitez toute information permettant de vous identifier.">${escapeHtml(state.comment)}</textarea>
      </div>`;
  }

  function answeredCount() {
    return config.questions.filter((q) => Number.isInteger(state.answers[q.id])).length;
  }

  function render() {
    const page = pages[pageIndex];
    $('page-title').textContent = page.title;
    $('page-body').innerHTML = page.type === 'questions' ? page.questions.map(renderQuestion).join('') : renderProfile();
    $('step-label').textContent = `Étape ${pageIndex + 1} sur ${pages.length}`;
    const answered = answeredCount();
    $('progress').style.width = `${(answered / config.questions.length) * 100}%`;
    $('answered-label').textContent = `${answered} / ${config.questions.length} questions répondues`;
    $('prev').disabled = pageIndex === 0;
    $('next').textContent = pageIndex === pages.length - 1 ? 'Envoyer mes réponses' : 'Suivant';
    $('form-error').classList.add('hidden');
  }

  function saveDraft() {
    store.set(draftKey, { ...state, pageIndex });
  }

  function showError(message) {
    $('form-error').textContent = message;
    $('form-error').classList.remove('hidden');
  }

  function validatePage() {
    const page = pages[pageIndex];
    if (page.type !== 'questions') return true;
    const missing = page.questions.filter((q) => !Number.isInteger(state.answers[q.id]));
    page.questions.forEach((q) => $(`block-${q.id}`).classList.toggle('missing', missing.includes(q)));
    if (missing.length) {
      showError(`Merci de répondre à toutes les questions de cette page (${missing.length} manquante${missing.length > 1 ? 's' : ''}).`);
      $(`block-${missing[0].id}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  async function submit() {
    $('next').disabled = true;
    try {
      const res = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur lors de l’envoi.');
      store.remove(draftKey);
      store.set(`barometre-done-${config.campaign.id}`, true);
      $('survey').classList.add('hidden');
      $('thanks').classList.remove('hidden');
      window.scrollTo(0, 0);
    } catch (err) {
      showError(`${err.message} Vos réponses sont conservées, vous pouvez réessayer.`);
    } finally {
      $('next').disabled = false;
    }
  }

  function bindEvents() {
    $('page-body').addEventListener('change', (e) => {
      const t = e.target;
      if (t.type === 'radio') {
        state.answers[t.name] = Number(t.value);
        $(`block-${t.name}`).classList.remove('missing');
        const answered = answeredCount();
        $('progress').style.width = `${(answered / config.questions.length) * 100}%`;
        $('answered-label').textContent = `${answered} / ${config.questions.length} questions répondues`;
      } else if (t.dataset.demo) {
        state.demographics[t.dataset.demo] = t.value || undefined;
      }
      saveDraft();
    });
    $('page-body').addEventListener('input', (e) => {
      if (e.target.id === 'comment') {
        state.comment = e.target.value;
        saveDraft();
      }
    });
    $('prev').addEventListener('click', () => {
      if (pageIndex > 0) {
        pageIndex -= 1;
        render();
        saveDraft();
        window.scrollTo(0, 0);
      }
    });
    $('next').addEventListener('click', () => {
      if (!validatePage()) return;
      if (pageIndex === pages.length - 1) {
        submit();
        return;
      }
      pageIndex += 1;
      render();
      saveDraft();
      window.scrollTo(0, 0);
    });
    $('start').addEventListener('click', () => {
      $('intro').classList.add('hidden');
      $('survey').classList.remove('hidden');
      render();
    });
  }

  async function init() {
    try {
      const res = await fetch('/api/questionnaire');
      config = await res.json();
    } catch {
      $('closed').textContent = 'Impossible de charger le questionnaire. Vérifiez votre connexion.';
      $('closed').classList.remove('hidden');
      return;
    }
    if (!config.campaign) {
      $('closed').classList.remove('hidden');
      return;
    }
    $('campaign-name').textContent = config.campaign.name;
    draftKey = `barometre-draft-${config.campaign.id}`;
    if (store.get(`barometre-done-${config.campaign.id}`)) $('already').classList.remove('hidden');

    const draft = store.get(draftKey);
    if (draft) {
      state = { answers: draft.answers || {}, demographics: draft.demographics || {}, comment: draft.comment || '' };
      pageIndex = Math.min(draft.pageIndex || 0, config.dimensions.length);
      $('start').textContent = 'Reprendre';
    }
    buildPages();
    bindEvents();
    $('start').disabled = false;
  }

  init();
})();
