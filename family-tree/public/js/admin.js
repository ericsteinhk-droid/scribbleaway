/* Admin panel logic */

let adminToken  = sessionStorage.getItem('adminToken') || null;
let allMembers  = []; // full cache for parent dropdowns

async function adminFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    ...opts
  });
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth ───────────────────────────────────────────────────────────────────────
async function login() {
  const pw  = document.getElementById('admin-pw').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    if (!res.ok) { err.textContent = t('adminWrong'); return; }
    const { token } = await res.json();
    adminToken = token;
    sessionStorage.setItem('adminToken', token);
    showDashboard();
  } catch {
    err.textContent = t('adminWrong');
  }
}

function logout() {
  adminToken = null;
  sessionStorage.removeItem('adminToken');
  showLogin();
}

// ── Layout ─────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-section').style.display    = 'flex';
  document.getElementById('dashboard-section').style.display = 'none';
}
function showDashboard() {
  document.getElementById('login-section').style.display    = 'none';
  document.getElementById('dashboard-section').style.display = 'block';
  loadDashboard();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([loadStats(), loadAllMembers()]);
  renderPendingList();
}

async function loadStats() {
  const stats = await adminFetch('/api/admin/stats');
  if (!stats) return;
  document.getElementById('stat-approved').textContent = stats.approved;
  document.getElementById('stat-pending').textContent  = stats.pending;
  document.getElementById('stat-rejected').textContent = stats.rejected;
}

async function loadAllMembers() {
  const list = await adminFetch('/api/admin/members');
  if (!list) return;
  allMembers = list;
  renderAllMembersList();
}

function renderPendingList() {
  const pending = allMembers.filter(p => p.status === 'pending');
  const container = document.getElementById('pending-list');
  if (!pending.length) {
    container.innerHTML = `<div class="no-items-msg">${t('adminNoPending')}</div>`;
    return;
  }
  container.innerHTML = '';
  pending.forEach(p => container.appendChild(buildMemberCard(p)));
}

function renderAllMembersList() {
  const container = document.getElementById('all-members-list');
  container.innerHTML = '';
  allMembers.forEach(p => container.appendChild(buildMemberCard(p)));
}

// ── Member card ────────────────────────────────────────────────────────────────
function buildMemberCard(p) {
  const card = document.createElement('div');
  card.className = 'member-card';
  card.id = `card-${p.id}`;

  const born = p.birth_year ? `${t('born')} ${p.birth_year}` : '';
  const died = p.death_year ? `${t('died')} ${p.death_year}` : '';
  const dates = [born, died].filter(Boolean).join('  ·  ') || t('unknown');
  const badgeClass = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' }[p.status];

  const fatherInfo = p.father_name ? `👨 ${escHtml(p.father_name)}` : '';
  const motherInfo = p.mother_name ? `👩 ${escHtml(p.mother_name)}` : '';
  const parentsLine = [fatherInfo, motherInfo].filter(Boolean).join('  ·  ');

  // ── View mode ──
  const viewDiv = document.createElement('div');
  viewDiv.className = 'card-view';
  viewDiv.innerHTML = `
    <div class="member-card-header">
      <div>
        <div class="member-name">${escHtml(p.first_name)} ${escHtml(p.last_name)}</div>
        <div class="member-meta">${dates}</div>
        ${parentsLine ? `<div class="member-meta" style="margin-top:3px">${parentsLine}</div>` : ''}
        ${p.notes ? `<div class="member-meta" style="margin-top:4px;font-style:italic">"${escHtml(p.notes.slice(0,120))}${p.notes.length>120?'…':''}"</div>` : ''}
        ${p.submitted_by ? `<div class="member-meta" style="margin-top:3px">${t('submittedBy')}: ${escHtml(p.submitted_by)}</div>` : ''}
        <div class="member-meta" style="margin-top:2px">${t('submittedOn')}: ${formatDate(p.submitted_at)}</div>
      </div>
      <span class="badge ${badgeClass}">${t('status' + cap(p.status))}</span>
    </div>
    <div class="member-actions">
      ${p.status === 'pending' ? `
        <input class="admin-note-input" id="note-${p.id}" placeholder="${t('adminNote')}">
        <button class="btn-approve" onclick="approveReject(${p.id},'approved')">${t('adminApprove')}</button>
        <button class="btn-reject"  onclick="approveReject(${p.id},'rejected')">${t('adminReject')}</button>
      ` : p.status === 'rejected' ? `
        <button class="btn-approve" onclick="approveReject(${p.id},'approved')">${t('adminApprove')}</button>
      ` : ''}
      <button class="btn-edit"   onclick="startEdit(${p.id})">${t('adminEdit')}</button>
      <button class="btn-delete" onclick="deleteMember(${p.id})">${t('adminDelete')}</button>
    </div>
  `;

  // ── Edit mode ──
  const editDiv = document.createElement('div');
  editDiv.className = 'card-edit';
  editDiv.style.display = 'none';
  editDiv.appendChild(buildEditForm(p));

  card.appendChild(viewDiv);
  card.appendChild(editDiv);
  return card;
}

// ── Edit form ──────────────────────────────────────────────────────────────────
function buildEditForm(p) {
  const form = document.createElement('div');
  form.className = 'edit-form';

  const approvedOthers = allMembers.filter(m => m.status === 'approved' && m.id !== p.id);

  function memberOption(m, selectedId) {
    const dates = m.birth_year ? ` (${m.birth_year})` : '';
    const sel = selectedId && m.id === selectedId ? ' selected' : '';
    return `<option value="${m.id}"${sel}>${escHtml(m.first_name)} ${escHtml(m.last_name)}${dates}</option>`;
  }

  const fatherOptions = approvedOthers.filter(m => m.gender !== 'female').map(m => memberOption(m, p.father_id)).join('');
  const motherOptions = approvedOthers.filter(m => m.gender !== 'male').map(m => memberOption(m, p.mother_id)).join('');

  form.innerHTML = `
    <div class="edit-row">
      <div class="edit-field">
        <label>${t('editFirstName')}</label>
        <input class="edit-input" id="ef-first-${p.id}" value="${escHtml(p.first_name)}">
      </div>
      <div class="edit-field">
        <label>${t('editLastName')}</label>
        <input class="edit-input" id="ef-last-${p.id}" value="${escHtml(p.last_name)}">
      </div>
    </div>
    <div class="edit-row">
      <div class="edit-field">
        <label>${t('editBorn')}</label>
        <input class="edit-input" type="number" id="ef-born-${p.id}" value="${p.birth_year || ''}" min="1700" max="2100">
      </div>
      <div class="edit-field">
        <label>${t('editDied')}</label>
        <input class="edit-input" type="number" id="ef-died-${p.id}" value="${p.death_year || ''}" min="1700" max="2100">
      </div>
    </div>
    <div class="edit-field">
      <label>${t('editGender')}</label>
      <select class="edit-select" id="ef-gender-${p.id}">
        <option value="male"    ${p.gender==='male'   ?'selected':''}>${t('step6male')}</option>
        <option value="female"  ${p.gender==='female' ?'selected':''}>${t('step6female')}</option>
        <option value="unknown" ${p.gender==='unknown'?'selected':''}>${t('step6unknown')}</option>
      </select>
    </div>
    <div class="edit-field">
      <label>${t('editFather')}</label>
      <select class="edit-select" id="ef-father-${p.id}">
        <option value="">${t('step7none')}</option>
        ${fatherOptions}
      </select>
      <input class="edit-input edit-new-parent" id="ef-father-new-${p.id}"
             placeholder="${t('editNewParentHint')}" style="margin-top:6px">
    </div>
    <div class="edit-field">
      <label>${t('editMother')}</label>
      <select class="edit-select" id="ef-mother-${p.id}">
        <option value="">${t('step7none')}</option>
        ${motherOptions}
      </select>
      <input class="edit-input edit-new-parent" id="ef-mother-new-${p.id}"
             placeholder="${t('editNewParentHint')}" style="margin-top:6px">
    </div>
    <div class="edit-field">
      <label>${t('editNotes')}</label>
      <textarea class="edit-textarea" id="ef-notes-${p.id}" rows="3">${escHtml(p.notes || '')}</textarea>
    </div>
    <div class="edit-actions">
      <button class="btn-approve" onclick="saveMember(${p.id})">${t('adminSave')}</button>
      <button class="btn-secondary" onclick="cancelEdit(${p.id})">${t('adminCancel')}</button>
    </div>
  `;

  // Mutual exclusion: dropdown ↔ new-name input
  const fatherSel = form.querySelector(`#ef-father-${p.id}`);
  const fatherNew = form.querySelector(`#ef-father-new-${p.id}`);
  const motherSel = form.querySelector(`#ef-mother-${p.id}`);
  const motherNew = form.querySelector(`#ef-mother-new-${p.id}`);

  fatherSel.addEventListener('change', () => { if (fatherSel.value) fatherNew.value = ''; });
  fatherNew.addEventListener('input',  () => { if (fatherNew.value.trim()) fatherSel.value = ''; });
  motherSel.addEventListener('change', () => { if (motherSel.value) motherNew.value = ''; });
  motherNew.addEventListener('input',  () => { if (motherNew.value.trim()) motherSel.value = ''; });

  return form;
}

function startEdit(id) {
  const card = document.getElementById(`card-${id}`);
  card.querySelector('.card-view').style.display = 'none';
  card.querySelector('.card-edit').style.display = 'block';
}

function cancelEdit(id) {
  const card = document.getElementById(`card-${id}`);
  card.querySelector('.card-view').style.display = '';
  card.querySelector('.card-edit').style.display = 'none';
}

async function saveMember(id) {
  const fatherNewName = document.getElementById(`ef-father-new-${id}`)?.value?.trim();
  const motherNewName = document.getElementById(`ef-mother-new-${id}`)?.value?.trim();

  let fatherId = document.getElementById(`ef-father-${id}`)?.value || null;
  let motherId = document.getElementById(`ef-mother-${id}`)?.value || null;

  // Create new parent entries (approved immediately, since admin is doing this)
  if (fatherNewName && !fatherId) {
    const parts = fatherNewName.split(/\s+/);
    const res = await adminFetch('/api/admin/members', {
      method: 'POST',
      body: JSON.stringify({ first_name: parts[0], last_name: parts.slice(1).join(' ') || '?', gender: 'male', status: 'approved' })
    });
    if (res) fatherId = String(res.id);
  }
  if (motherNewName && !motherId) {
    const parts = motherNewName.split(/\s+/);
    const res = await adminFetch('/api/admin/members', {
      method: 'POST',
      body: JSON.stringify({ first_name: parts[0], last_name: parts.slice(1).join(' ') || '?', gender: 'female', status: 'approved' })
    });
    if (res) motherId = String(res.id);
  }

  await adminFetch(`/api/admin/members/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      first_name: document.getElementById(`ef-first-${id}`)?.value?.trim(),
      last_name:  document.getElementById(`ef-last-${id}`)?.value?.trim(),
      birth_year: document.getElementById(`ef-born-${id}`)?.value  || null,
      death_year: document.getElementById(`ef-died-${id}`)?.value  || null,
      gender:     document.getElementById(`ef-gender-${id}`)?.value || 'unknown',
      father_id:  fatherId || null,
      mother_id:  motherId || null,
      notes:      document.getElementById(`ef-notes-${id}`)?.value?.trim() || null,
    })
  });

  await loadDashboard();
}

// ── Approve / Reject ───────────────────────────────────────────────────────────
async function approveReject(id, status) {
  const noteInput = document.getElementById(`note-${id}`);
  await adminFetch(`/api/admin/members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_notes: noteInput?.value || '' })
  });
  await loadDashboard();
}

async function deleteMember(id) {
  if (!confirm(t('adminConfirmDelete'))) return;
  await adminFetch(`/api/admin/members/${id}`, { method: 'DELETE' });
  await loadDashboard();
}

// ── Tab switching ──────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// ── Translations ───────────────────────────────────────────────────────────────
function applyAdminTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('adminTitle') + ' · ' + t('appTitle');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString(currentLang === 'fr' ? 'fr-FR' : 'en-GB',
    { year:'numeric', month:'short', day:'numeric' });
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const langBtn = document.getElementById('admin-lang-toggle');
  if (langBtn) {
    langBtn.textContent = currentLang === 'fr' ? 'EN' : 'FR';
    langBtn.addEventListener('click', () => {
      setLang(currentLang === 'fr' ? 'en' : 'fr');
      langBtn.textContent = currentLang === 'fr' ? 'EN' : 'FR';
      applyAdminTranslations();
      if (adminToken) loadDashboard();
    });
  }

  applyAdminTranslations();

  document.getElementById('login-form')?.addEventListener('submit', e => { e.preventDefault(); login(); });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  if (adminToken) showDashboard(); else showLogin();
});
