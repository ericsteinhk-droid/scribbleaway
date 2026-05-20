/* Main application logic */

let treeRenderer = null;
let familyData   = [];
let selectedPerson = null;

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Language toggle ────────────────────────────────────────────────────────────
function initLangToggle() {
  const toggle = document.getElementById('lang-toggle');
  function updateToggle() {
    toggle.textContent = currentLang === 'fr' ? 'EN' : 'FR';
    toggle.setAttribute('aria-label', currentLang === 'fr' ? 'Switch to English' : 'Passer en français');
  }
  toggle.addEventListener('click', () => {
    setLang(currentLang === 'fr' ? 'en' : 'fr');
  });
  document.addEventListener('langchange', () => {
    updateToggle();
    applyTranslations();
    if (treeRenderer) treeRenderer.render(familyData);
  });
  updateToggle();
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.title = t('appTitle');
}

// ── Tree ───────────────────────────────────────────────────────────────────────
async function loadTree() {
  const loading = document.getElementById('tree-loading');
  const empty   = document.getElementById('tree-empty');
  const svgEl   = document.getElementById('tree-svg');

  loading.style.display = 'flex';
  empty.style.display   = 'none';

  try {
    familyData = await apiFetch('/api/family');
  } catch {
    loading.style.display = 'none';
    return;
  }

  loading.style.display = 'none';

  if (!familyData.length) {
    empty.style.display = 'flex';
    return;
  }

  if (!treeRenderer) {
    treeRenderer = new FamilyTreeRenderer(svgEl, openPersonDetail);
  }
  treeRenderer.render(familyData);
}

// ── Person detail panel ────────────────────────────────────────────────────────
function openPersonDetail(person) {
  selectedPerson = person;
  const panel = document.getElementById('detail-panel');
  const nameEl  = document.getElementById('detail-name');
  const datesEl = document.getElementById('detail-dates');
  const notesEl = document.getElementById('detail-notes');

  nameEl.textContent  = `${person.first_name} ${person.last_name}`;

  const born = person.birth_year ? `${t('born')} ${person.birth_year}` : '';
  const died = person.death_year ? `${t('died')} ${person.death_year}` : (person.birth_year ? t('alive') : '');
  datesEl.textContent = [born, died].filter(Boolean).join('  ·  ') || t('unknown');

  notesEl.textContent = person.notes || t('noNotes');

  panel.classList.add('open');
}

function closePersonDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedPerson = null;
}

// ── Questionnaire ──────────────────────────────────────────────────────────────
const TOTAL_STEPS = 8;
let currentStep = 1;
let formData    = {};

function openQuestionnaire() {
  currentStep = 1;
  formData    = { alive: true };
  renderStep();
  document.getElementById('quest-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeQuestionnaire() {
  document.getElementById('quest-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function renderStep() {
  const modal = document.getElementById('quest-modal');

  // Progress
  modal.querySelector('.quest-progress-fill').style.width = `${(currentStep / TOTAL_STEPS) * 100}%`;
  modal.querySelector('.quest-step-label').textContent = t('stepOf', currentStep, TOTAL_STEPS);

  // Title
  modal.querySelector('.quest-title').textContent = t('questTitle');

  // Back button
  const backBtn = modal.querySelector('.btn-back');
  backBtn.style.visibility = currentStep > 1 ? 'visible' : 'hidden';
  backBtn.textContent = t('back');

  // Next / Submit button
  const nextBtn = modal.querySelector('.btn-next');
  nextBtn.textContent = currentStep === TOTAL_STEPS ? t('submit') : t('next');

  // Render step content
  const body = modal.querySelector('.quest-body');
  body.innerHTML = '';

  const step = buildStep(currentStep);
  body.appendChild(step);

  // Animate in
  body.classList.remove('slide-in');
  void body.offsetWidth;
  body.classList.add('slide-in');

  // Focus first input
  const first = body.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 120);
}

function buildStep(n) {
  const div = document.createElement('div');
  div.className = 'quest-step';

  const question = (q, hint) => {
    const el = document.createElement('div');
    el.innerHTML = `
      <p class="quest-question">${q}</p>
      ${hint ? `<p class="quest-hint">${hint}</p>` : ''}
    `;
    return el;
  };

  switch (n) {
    case 1: {
      div.appendChild(question(t('step1q'), t('step1hint')));
      div.appendChild(textInput('fullName', formData.fullName || '', t('step1hint')));
      break;
    }
    case 2: {
      div.appendChild(question(t('step3q'), ''));
      div.appendChild(yearInput('birthYear', formData.birthYear, t('step3hint'), t('step3skip')));
      break;
    }
    case 3: {
      div.appendChild(question(t('step4q'), ''));
      const opts = div.appendChild(document.createElement('div'));
      opts.className = 'choice-grid';
      opts.appendChild(choiceBtn('alive', true,  '🌱', t('step4yes'), formData.alive !== false));
      opts.appendChild(choiceBtn('alive', false, '🕊️', t('step4no'),  formData.alive === false));
      break;
    }
    case 4: {
      div.appendChild(question(t('step5q'), ''));
      div.appendChild(yearInput('deathYear', formData.deathYear, t('step5hint'), t('step5skip')));
      break;
    }
    case 5: {
      div.appendChild(question(t('step6q'), ''));
      const opts = div.appendChild(document.createElement('div'));
      opts.className = 'choice-grid choice-grid-3';
      opts.appendChild(choiceBtn('gender', 'male',    '👨', t('step6male'),    formData.gender === 'male'));
      opts.appendChild(choiceBtn('gender', 'female',  '👩', t('step6female'),  formData.gender === 'female'));
      opts.appendChild(choiceBtn('gender', 'unknown', '🧑', t('step6unknown'), !formData.gender || formData.gender === 'unknown'));
      break;
    }
    case 6: {
      div.appendChild(question(t('step7q'), t('step7hint')));
      div.appendChild(parentSelect('fatherId', formData.fatherId, t('step7father'), 'male'));
      div.appendChild(parentSelect('motherId', formData.motherId, t('step7mother'), 'female'));
      break;
    }
    case 7: {
      div.appendChild(question(t('step8q'), t('step8hint')));
      const ta = document.createElement('textarea');
      ta.className = 'quest-textarea';
      ta.placeholder = t('step8hint');
      ta.value = formData.notes || '';
      ta.rows = 4;
      ta.addEventListener('input', () => { formData.notes = ta.value; });
      div.appendChild(ta);
      break;
    }
    case 8: {
      div.appendChild(question(t('step9q'), t('step9hint')));
      div.appendChild(textInput('submittedBy', formData.submittedBy || '', t('step9hint')));
      div.appendChild(summaryCard());
      break;
    }
  }
  return div;
}

function textInput(field, value, placeholder) {
  const inp = document.createElement('input');
  inp.type  = 'text';
  inp.className = 'quest-input';
  inp.value = value || '';
  inp.placeholder = placeholder || '';
  inp.addEventListener('input', () => { formData[field] = inp.value; });
  return inp;
}

function yearInput(field, value, placeholder, skipLabel) {
  const wrap = document.createElement('div');
  wrap.className = 'year-wrap';

  const inp = document.createElement('input');
  inp.type  = 'number';
  inp.className = 'quest-input year-input';
  inp.placeholder = placeholder;
  inp.min = 1700; inp.max = new Date().getFullYear();
  inp.value = value || '';
  inp.addEventListener('input', () => {
    formData[field] = inp.value ? parseInt(inp.value) : null;
    skipBtn.classList.toggle('active', !inp.value);
  });

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'skip-btn' + (value ? '' : ' active');
  skipBtn.textContent = skipLabel;
  skipBtn.addEventListener('click', () => {
    inp.value = '';
    formData[field] = null;
    skipBtn.classList.add('active');
  });

  wrap.appendChild(inp);
  wrap.appendChild(skipBtn);
  return wrap;
}

function choiceBtn(field, value, emoji, label, selected) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'choice-btn' + (selected ? ' selected' : '');
  btn.innerHTML = `<span class="choice-emoji">${emoji}</span><span class="choice-label">${label}</span>`;
  btn.addEventListener('click', () => {
    formData[field] = value;
    btn.closest('.choice-grid').querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
  return btn;
}

function parentSelect(field, value, label, preferGender) {
  const newNameField = field === 'fatherId' ? 'newFatherName' : 'newMotherName';

  const wrap = document.createElement('div');
  wrap.className = 'parent-select-wrap';

  const lbl = document.createElement('label');
  lbl.className = 'parent-label';
  lbl.textContent = label;

  const sel = document.createElement('select');
  sel.className = 'quest-select';

  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('step7none');
  sel.appendChild(none);

  const sorted = [...familyData].sort((a, b) => {
    if (a.gender === preferGender && b.gender !== preferGender) return -1;
    if (b.gender === preferGender && a.gender !== preferGender) return 1;
    return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
  });

  sorted.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const dates = p.birth_year ? ` (${p.birth_year}${p.death_year ? '–'+p.death_year : ''})` : '';
    opt.textContent = `${p.first_name} ${p.last_name}${dates}`;
    if (value && parseInt(value) === p.id) opt.selected = true;
    sel.appendChild(opt);
  });

  // "Type new name" input
  const divider = document.createElement('p');
  divider.className = 'parent-or';
  divider.textContent = t('step7orType');

  const newInp = document.createElement('input');
  newInp.type = 'text';
  newInp.className = 'quest-input';
  newInp.placeholder = t('step7newNameHint');
  newInp.value = formData[newNameField] || '';

  // Mutual exclusion: selecting from dropdown clears typed name and vice-versa
  sel.addEventListener('change', () => {
    formData[field] = sel.value ? parseInt(sel.value) : null;
    if (sel.value) { newInp.value = ''; formData[newNameField] = null; }
  });
  newInp.addEventListener('input', () => {
    formData[newNameField] = newInp.value.trim() || null;
    if (newInp.value.trim()) { sel.value = ''; formData[field] = null; }
  });

  wrap.appendChild(lbl);
  wrap.appendChild(sel);
  wrap.appendChild(divider);
  wrap.appendChild(newInp);
  return wrap;
}

function summaryCard() {
  const card = document.createElement('div');
  card.className = 'summary-card';

  const name = formData.fullName || '?';
  const born = formData.birthYear ? `${t('born')} ${formData.birthYear}` : '';
  const died = formData.alive === false && formData.deathYear ? `${t('died')} ${formData.deathYear}` : (formData.alive !== false && formData.birthYear ? `· ${t('alive')}` : '');

  card.innerHTML = `
    <div class="summary-name">${name}</div>
    <div class="summary-dates">${[born, died].filter(Boolean).join(' ')}</div>
  `;
  return card;
}

function validateStep(n) {
  switch (n) {
    case 1:
      if (!formData.fullName?.trim()) { showStepError(t('errorRequired')); return false; }
      break;
    case 2:
      if (formData.birthYear && (formData.birthYear < 1700 || formData.birthYear > new Date().getFullYear())) {
        showStepError(t('errorYear')); return false;
      }
      break;
    case 4:
      if (formData.deathYear && formData.birthYear && formData.deathYear < formData.birthYear) {
        showStepError(t('errorYear')); return false;
      }
      break;
  }
  return true;
}

function showStepError(msg) {
  let err = document.querySelector('.quest-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'quest-error';
    document.querySelector('.quest-body').appendChild(err);
  }
  err.textContent = msg;
  err.style.display = 'block';
  setTimeout(() => { err.style.display = 'none'; }, 3000);
}

async function advanceStep() {
  if (!validateStep(currentStep)) return;

  if (currentStep === TOTAL_STEPS) {
    await submitForm();
    return;
  }

  // Skip death year step if alive
  if (currentStep === 3 && formData.alive !== false) {
    formData.deathYear = null;
    currentStep = 5;
  } else {
    currentStep++;
  }
  renderStep();
}

function retreatStep() {
  if (currentStep === 5 && formData.alive !== false) {
    currentStep = 3;
  } else {
    currentStep--;
  }
  renderStep();
}

async function submitForm() {
  const nextBtn = document.querySelector('.btn-next');
  nextBtn.disabled = true;
  nextBtn.textContent = t('submitting');

  const nameParts = (formData.fullName || '').trim().split(/\s+/);
  const payload = {
    first_name:      nameParts[0] || '?',
    last_name:       nameParts.slice(1).join(' ') || '?',
    birth_year:      formData.birthYear  || null,
    death_year:      formData.alive === false ? (formData.deathYear || null) : null,
    gender:          formData.gender     || 'unknown',
    father_id:       formData.fatherId   || null,
    mother_id:       formData.motherId   || null,
    new_father_name: formData.newFatherName || null,
    new_mother_name: formData.newMotherName || null,
    notes:           formData.notes?.trim() || null,
    submitted_by:    formData.submittedBy?.trim() || null,
  };

  try {
    await apiFetch('/api/family', { method: 'POST', body: JSON.stringify(payload) });
    showSuccess();
  } catch {
    nextBtn.disabled = false;
    nextBtn.textContent = t('submit');
    showStepError(t('errorNetwork'));
  }
}

function showSuccess() {
  const modal = document.getElementById('quest-modal');
  modal.querySelector('.quest-content').innerHTML = `
    <div class="success-screen">
      <div class="success-title">${t('successTitle')}</div>
      <p class="success-msg">${t('successMsg')}</p>
      <div class="success-actions">
        <button class="btn-primary" id="add-another-btn">${t('addAnother')}</button>
        <button class="btn-secondary" id="success-close-btn">${t('successClose')}</button>
      </div>
    </div>
  `;
  document.getElementById('add-another-btn').addEventListener('click', () => {
    currentStep = 1;
    formData = { alive: true };
    modal.querySelector('.quest-content').innerHTML = questTemplate();
    attachQuestEvents();
    renderStep();
  });
  document.getElementById('success-close-btn').addEventListener('click', closeQuestionnaire);
}

// ── Questionnaire modal template ───────────────────────────────────────────────
function questTemplate() {
  return `
    <div class="quest-header">
      <h2 class="quest-title">${t('questTitle')}</h2>
      <button class="quest-close" aria-label="Close">✕</button>
    </div>
    <div class="quest-progress">
      <div class="quest-progress-fill"></div>
    </div>
    <div class="quest-step-label"></div>
    <div class="quest-body"></div>
    <div class="quest-footer">
      <button class="btn-back">${t('back')}</button>
      <button class="btn-next btn-primary">${t('next')}</button>
    </div>
  `;
}

function attachQuestEvents() {
  const modal = document.getElementById('quest-modal');
  modal.querySelector('.quest-close').addEventListener('click', closeQuestionnaire);
  modal.querySelector('.btn-back').addEventListener('click', retreatStep);
  modal.querySelector('.btn-next').addEventListener('click', advanceStep);
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLangToggle();
  applyTranslations();

  // Questionnaire modal setup
  const modal = document.getElementById('quest-modal');
  modal.querySelector('.quest-content').innerHTML = questTemplate();
  attachQuestEvents();

  // Add member button
  document.getElementById('add-member-btn').addEventListener('click', openQuestionnaire);

  // Close modal on backdrop click
  modal.addEventListener('click', e => { if (e.target === modal) closeQuestionnaire(); });

  // Detail panel close
  document.getElementById('detail-close').addEventListener('click', closePersonDetail);

  // Tree controls
  document.getElementById('zoom-in-btn').addEventListener('click',  () => treeRenderer?.zoomBy(1.3));
  document.getElementById('zoom-out-btn').addEventListener('click', () => treeRenderer?.zoomBy(0.77));
  document.getElementById('reset-btn').addEventListener('click',    () => treeRenderer?.resetView());

  // Click on SVG background closes detail
  document.getElementById('tree-svg').addEventListener('click', closePersonDetail);

  loadTree();
});
