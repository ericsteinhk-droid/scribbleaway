// All API calls go through this module.
// The proxy in vite.config.js forwards /api → http://localhost:3001

let _password = null;

export function setPassword(pw) { _password = pw; }

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (_password) h['X-App-Password'] = _password;
  return h;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.message || d.error || msg; } catch {}
    throw new Error(msg);
  }
  return res;
}

async function apiJSON(path, opts = {}) {
  const res = await apiFetch(path, opts);
  return res.json();
}

/* ── Streaming chat ─────────────────────────────────────────── */

/**
 * Stream a chat completion.
 * Calls onChunk(text) for each delta, onDone({inputTokens, outputTokens, cost}) when finished,
 * onError(message) on error.
 */
export async function streamChat({ provider, model, messages, systemPrompt, temperature, maxTokens, attachments = [], conversationId }, onChunk, onDone, onError, signal) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ provider, model, messages, systemPrompt, temperature, maxTokens, attachments, conversationId }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError(err.message);
    return;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.message || d.error || msg; } catch {}
    onError(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.type === 'delta') onChunk(evt.text || '');
          else if (evt.type === 'done') onDone({ inputTokens: evt.inputTokens, outputTokens: evt.outputTokens, cost: evt.cost });
          else if (evt.type === 'error') onError(evt.message);
        } catch {}
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') onError(err.message);
  }
}

/* ── Conversations ──────────────────────────────────────────── */

export const convApi = {
  list: () => apiJSON('/conversations'),
  get:  (id) => apiJSON(`/conversations/${id}`),
  create: (data) => apiJSON('/conversations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiJSON(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => apiJSON(`/conversations/${id}`, { method: 'DELETE' }),
  deleteAll: () => apiJSON('/conversations', { method: 'DELETE', body: JSON.stringify({ ids: 'all' }) }),
  search: (q) => apiJSON(`/conversations/search?q=${encodeURIComponent(q)}`),
  fork: (id, messageId) => apiJSON(`/conversations/${id}/fork`, { method: 'POST', body: JSON.stringify({ messageId }) }),
};

/* ── Messages ───────────────────────────────────────────────── */

export const msgApi = {
  list:   (convId) => apiJSON(`/messages?conversationId=${convId}`),
  update: (id, data) => apiJSON(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => apiJSON(`/messages/${id}`, { method: 'DELETE' }),
};

/* ── Settings ───────────────────────────────────────────────── */

export const settingsApi = {
  get: () => apiJSON('/settings'),
  set: (data) => apiJSON('/settings', { method: 'POST', body: JSON.stringify(data) }),
};

/* ── Prompt library ─────────────────────────────────────────── */

export const promptApi = {
  list:   () => apiJSON('/settings/prompts'),
  create: (data) => apiJSON('/settings/prompts', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => apiJSON(`/settings/prompts/${id}`, { method: 'DELETE' }),
};

/* ── Folders ────────────────────────────────────────────────── */

export const folderApi = {
  list:   () => apiJSON('/settings/folders'),
  create: (data) => apiJSON('/settings/folders', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => apiJSON(`/settings/folders/${id}`, { method: 'DELETE' }),
};

/* ── Export / Import ────────────────────────────────────────── */

export const exportApi = {
  markdown: (id) => `/api/export/${id}/markdown`,
  json:     (id) => `/api/export/${id}/json`,
  all:      ()   => '/api/export/all',
  import:   (data) => apiJSON('/export/import', { method: 'POST', body: JSON.stringify(data) }),
};

/* ── Admin ──────────────────────────────────────────────────── */

export const adminApi = {
  auditLog: () => apiJSON('/admin/audit-log'),
  stats:    () => apiJSON('/admin/stats'),
  reloadEnv: () => apiJSON('/admin/reload-env', { method: 'POST' }),
  runTtl:   () => apiJSON('/admin/expired', { method: 'DELETE' }),
};

/* ── Auth ───────────────────────────────────────────────────── */

export const authApi = {
  check:  () => apiFetch('/auth/check').then(r => r.ok).catch(() => false),
  verify: (pw) => apiJSON('/auth/verify', { method: 'POST', body: JSON.stringify({ password: pw }) }),
};

/* ── Title generation ───────────────────────────────────────── */

export async function generateTitle(provider, model, firstUserMessage) {
  try {
    const result = await apiJSON('/chat/title', {
      method: 'POST',
      body: JSON.stringify({ provider, model, message: firstUserMessage }),
    });
    return result.title || null;
  } catch {
    return null;
  }
}
