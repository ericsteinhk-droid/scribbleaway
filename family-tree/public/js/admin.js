/* Admin panel logic */

let adminToken = sessionStorage.getItem('adminToken') || null;

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
  document.getElementById('login-section').style.display   = 'flex';
  document.getElementById('dashboard-section').style.display = 'none';
}

function showDashboard() {
  document.getElementById('login-section').style.display   = 'none';
  document.getElementById('dashboard-section').style.display = 'block';
  loadDashboard();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([loadStats(), loadPending(), loadAllMembers()]);
}

async function loadStats() {
  const stats = await adminFetch('/api/admin/stats');
  if (!stats) return;
  document.getElementById('stat-approved').textContent = stats.approved;
  document.getElementById('stat-pending').textContent  = stats.pending;
  document.getElementById('stat-rejected').textContent = stats.rejected;
}

async function loadPending() {
  const list = await adminFetch('/api/admin/pending');
  if (!list) return;

  const container = document.getElementById('pending-list');
  if (!list.length) {
    container.innerHTML = `<div class="no-items-msg">${t('adminNoPending')}</div>`;
    return;
  }
  container.innerHTML = '';
  list.forEach(p => container.appendChild(buildMemberCard(p, true)));
}

async function loadAllMembers() {
  const list = await adminFetch('/api/admin/members');
  if (!list) return;

  const container = document.getElementById('all-members-list');
  container.innerHTML = '';
  list.forEach(p => container.appendChild(buildMemberCard(p, false)));
}

function buildMemberCard(p, isPendingView) {
  const card = document.createElement('div');
  card.className = 'member-card';
  card.id = `card-${p.id}`;

  const born = p.birth_year ? `${t('born')} ${p.birth_year}` : '';
  const died = p.death_year ? `${t('died')} ${p.death_year}` : '';
  const dates = [born, died].filter(Boolean).join('  ·  ') || t('unknown');

  const fatherInfo = p.father_name ? `<span>👨 ${p.father_name}</span>` : '';
  const motherInfo = p.mother_name ? `<span>👩 ${p.mother_name}</span>` : '';

  const badgeClass = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' }[p.status];

  card.innerHTML = `
    <div class="member-card-header">
      <div>
        <div class="member-name">${escHtml(p.first_name)} ${escHtml(p.last_name)}</div>
        <div class="member-meta">${dates}</div>
        ${fatherInfo || motherInfo ? `<div class="member-meta" style="margin-top:3px">${[fatherInfo, motherInfo].filter(Boolean).join('  ·  ')}</div>` : ''}
        ${p.notes ? `<div class="member-meta" style="margin-top:4px;font-style:italic">"${escHtml(p.notes.slice(0,120))}${p.notes.length>120?'…':''}"</div>` : ''}
        ${p.submitted_by ? `<div class="member-meta" style="margin-top:3px">${t('submittedBy')}: ${escHtml(p.submitted_by)}</div>` : ''}
        <div class="member-meta" style="margin-top:2px">${t('submittedOn')}: ${formatDate(p.submitted_at)}</div>
      </div>
      <span class="badge ${badgeClass}">${t('status' + cap(p.status))}</span>
    </div>
    ${isPendingView ? `
      <input class="admin-note-input" id="note-${p.id}" placeholder="${t('adminNote')}">
      <div class="member-actions">
        <button class="btn-approve" onclick="approveReject(${p.id},'approved')">${t('adminApprove')}</button>
        <button class="btn-reject"  onclick="approveReject(${p.id},'rejected')">${t('adminReject')}</button>
        <button class="btn-delete"  onclick="deleteMember(${p.id})">${t('adminDelete')}</button>
      </div>
    ` : `
      <div class="member-actions">
        ${p.status === 'pending' ? `
          <button class="btn-approve" onclick="approveReject(${p.id},'approved')">${t('adminApprove')}</button>
          <button class="btn-reject"  onclick="approveReject(${p.id},'rejected')">${t('adminReject')}</button>
        ` : p.status === 'rejected' ? `
          <button class="btn-approve" onclick="approveReject(${p.id},'approved')">${t('adminApprove')}</button>
        ` : ''}
        <button class="btn-delete" onclick="deleteMember(${p.id})">${t('adminDelete')}</button>
      </div>
    `}
  `;
  return card;
}

async function approveReject(id, status) {
  const noteInput = document.getElementById(`note-${id}`);
  const admin_notes = noteInput?.value || '';
  await adminFetch(`/api/admin/members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_notes })
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

// ── Language + translations ───────────────────────────────────────────────────
function applyAdminTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('adminTitle') + ' · ' + t('appTitle');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString(currentLang === 'fr' ? 'fr-FR' : 'en-GB', { year:'numeric', month:'short', day:'numeric' });
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Language toggle
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

  // Login form
  document.getElementById('login-form')?.addEventListener('submit', e => { e.preventDefault(); login(); });
  document.getElementById('admin-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Check if already logged in
  if (adminToken) {
    showDashboard();
  } else {
    showLogin();
  }
});
