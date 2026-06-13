/**
 * Conversations CRUD routes.
 *
 * GET    /api/conversations              - List all conversations
 * POST   /api/conversations              - Create a conversation
 * GET    /api/conversations/:id          - Get single conversation with messages
 * PATCH  /api/conversations/:id          - Update title/folder/pin/model/systemPrompt
 * DELETE /api/conversations/:id          - Delete conversation (and cascade messages)
 * DELETE /api/conversations              - Bulk delete (body: { ids: [...] })
 * GET    /api/conversations/search?q=   - Full-text search across messages
 */

import { Router } from 'express';
import db, { generateId, fromJson, fromBool } from '../db/database.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a raw SQLite conversation row to a clean JS object.
 */
function mapConversation(row) {
  if (!row) return null;
  return {
    id:           row.id,
    title:        row.title,
    folderId:     row.folder_id ?? null,
    systemPrompt: row.system_prompt ?? null,
    model:        row.model ?? null,
    pinned:       fromBool(row.pinned),
    ephemeral:    fromBool(row.ephemeral),
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    messageCount: row.message_count ?? undefined,
  };
}

// ── Prepared statements ───────────────────────────────────────────────────────

const listConversations = db.prepare(`
  SELECT c.*,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
  FROM conversations c
  ORDER BY c.pinned DESC, c.updated_at DESC
`);

const getConversation = db.prepare(`
  SELECT c.*,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
  FROM conversations c
  WHERE c.id = ?
`);

const getConversationMessages = db.prepare(`
  SELECT * FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at ASC
`);

const insertConversation = db.prepare(`
  INSERT INTO conversations (id, title, folder_id, system_prompt, model, pinned, ephemeral)
  VALUES (@id, @title, @folder_id, @system_prompt, @model, @pinned, @ephemeral)
`);

const deleteConversation = db.prepare(`
  DELETE FROM conversations WHERE id = ?
`);

// ── GET /api/conversations ────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const rows = listConversations.all();
    res.json(rows.map(mapConversation));
  } catch (err) {
    console.error('[conversations] list error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── GET /api/conversations/search ─────────────────────────────────────────────
// Must be declared before /:id to avoid "search" being treated as an ID.

router.get('/search', (req, res) => {
  const { q, limit = '50' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Query parameter `q` must be at least 2 characters.',
    });
  }

  const maxResults = Math.min(parseInt(limit, 10) || 50, 200);

  try {
    // Use FTS5 to find matching messages, then join back to conversations
    const rows = db.prepare(`
      SELECT
        m.id          AS message_id,
        m.conversation_id,
        m.role,
        snippet(messages_fts, 0, '<mark>', '</mark>', '…', 24) AS snippet,
        m.created_at  AS message_created_at,
        c.title       AS conversation_title,
        c.updated_at  AS conversation_updated_at
      FROM messages_fts
      JOIN messages m      ON messages_fts.rowid = m.rowid
      JOIN conversations c ON m.conversation_id = c.id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(q.trim(), maxResults);

    res.json({
      query: q.trim(),
      count: rows.length,
      results: rows,
    });
  } catch (err) {
    console.error('[conversations] search error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/conversations ───────────────────────────────────────────────────

router.post('/', (req, res) => {
  const {
    id: bodyId,
    title        = 'New Conversation',
    folderId     = null,
    systemPrompt = null,
    model        = null,
    pinned       = false,
    ephemeral    = false,
  } = req.body ?? {};

  const id = bodyId || generateId();

  try {
    insertConversation.run({
      id,
      title,
      folder_id:     folderId,
      system_prompt: systemPrompt,
      model,
      pinned:        pinned ? 1 : 0,
      ephemeral:     ephemeral ? 1 : 0,
    });

    const row = getConversation.get(id);
    res.status(201).json(mapConversation(row));
  } catch (err) {
    console.error('[conversations] create error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── GET /api/conversations/:id ────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  try {
    const row = getConversation.get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Not Found', message: 'Conversation not found' });
    }

    const messages = getConversationMessages.all(req.params.id).map(m => ({
      id:                 m.id,
      conversationId:     m.conversation_id,
      role:               m.role,
      content:            m.content,
      model:              m.model ?? null,
      provider:           m.provider ?? null,
      attachments:        fromJson(m.attachments),
      excludedFromContext: fromBool(m.excluded_from_context),
      tokenInput:         m.token_input ?? null,
      tokenOutput:        m.token_output ?? null,
      costUsd:            m.cost_usd ?? null,
      createdAt:          m.created_at,
    }));

    res.json({ ...mapConversation(row), messages });
  } catch (err) {
    console.error('[conversations] get error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── PATCH /api/conversations/:id ──────────────────────────────────────────────

router.patch('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const existing = getConversation.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Conversation not found' });
    }

    const allowed = ['title', 'folder_id', 'system_prompt', 'model', 'pinned', 'ephemeral'];
    const updates = [];
    const values  = [];

    const body = req.body ?? {};

    // Map camelCase body fields to snake_case DB columns
    const fieldMap = {
      title:        'title',
      folderId:     'folder_id',
      systemPrompt: 'system_prompt',
      model:        'model',
      pinned:       'pinned',
      ephemeral:    'ephemeral',
    };

    for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
      if (bodyKey in body) {
        if (!allowed.includes(dbCol)) continue;
        let val = body[bodyKey];
        if (dbCol === 'pinned' || dbCol === 'ephemeral') {
          val = val ? 1 : 0;
        }
        updates.push(`${dbCol} = ?`);
        values.push(val ?? null);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'No valid fields to update' });
    }

    updates.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    values.push(id);

    db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = getConversation.get(id);
    res.json(mapConversation(updated));
  } catch (err) {
    console.error('[conversations] update error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── DELETE /api/conversations/:id ─────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    const existing = getConversation.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Conversation not found' });
    }
    deleteConversation.run(req.params.id);
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    console.error('[conversations] delete error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── DELETE /api/conversations (bulk) ─────────────────────────────────────────

router.delete('/', (req, res) => {
  const { ids } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: '`ids` array is required' });
  }

  try {
    const deleteBulk = db.transaction((idList) => {
      let deleted = 0;
      for (const id of idList) {
        const result = deleteConversation.run(id);
        deleted += result.changes;
      }
      return deleted;
    });

    const deleted = deleteBulk(ids);
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error('[conversations] bulk delete error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
