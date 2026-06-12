/**
 * Admin routes.
 *
 * GET  /api/admin/stats          - Usage statistics (message count, token totals, cost)
 * GET  /api/admin/audit          - Audit log with pagination
 * GET  /api/admin/folders        - List all folders
 * POST /api/admin/folders        - Create a folder
 * PATCH /api/admin/folders/:id   - Rename / recolor a folder
 * DELETE /api/admin/folders/:id  - Delete folder (conversations unlinked, not deleted)
 * POST /api/admin/vacuum         - Run VACUUM to reclaim SQLite space
 * POST /api/admin/import         - Import a full backup JSON (created by /api/export/all)
 */

import { Router }   from 'express';
import db, { generateId, fromJson } from '../db/database.js';

const router = Router();

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM conversations)                        AS total_conversations,
        (SELECT COUNT(*) FROM messages)                            AS total_messages,
        (SELECT COUNT(*) FROM messages WHERE role = 'user')        AS user_messages,
        (SELECT COUNT(*) FROM messages WHERE role = 'assistant')   AS assistant_messages,
        (SELECT COALESCE(SUM(token_input),  0) FROM audit_log)    AS total_input_tokens,
        (SELECT COALESCE(SUM(token_output), 0) FROM audit_log)    AS total_output_tokens,
        (SELECT COALESCE(SUM(cost_usd),     0) FROM messages WHERE cost_usd IS NOT NULL) AS total_cost_usd,
        (SELECT COUNT(*) FROM folders)                             AS total_folders,
        (SELECT COUNT(*) FROM prompt_library)                      AS total_prompts
    `).get();

    // Per-provider breakdown
    const byProvider = db.prepare(`
      SELECT provider, COUNT(*) AS requests,
        COALESCE(SUM(token_input), 0)  AS input_tokens,
        COALESCE(SUM(token_output), 0) AS output_tokens
      FROM audit_log
      WHERE provider IS NOT NULL
      GROUP BY provider
    `).all();

    // Per-model breakdown
    const byModel = db.prepare(`
      SELECT model, provider, COUNT(*) AS requests,
        COALESCE(SUM(token_input), 0)  AS input_tokens,
        COALESCE(SUM(token_output), 0) AS output_tokens
      FROM audit_log
      WHERE model IS NOT NULL
      GROUP BY model, provider
      ORDER BY requests DESC
      LIMIT 20
    `).all();

    // Daily usage for the last 30 days
    const dailyUsage = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', ts) AS date,
        COUNT(*)                 AS requests,
        COALESCE(SUM(token_input + token_output), 0) AS tokens
      FROM audit_log
      WHERE ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
      GROUP BY date
      ORDER BY date ASC
    `).all();

    res.json({
      summary:    stats,
      byProvider,
      byModel,
      dailyUsage,
    });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── GET /api/admin/audit ──────────────────────────────────────────────────────

router.get('/audit', (req, res) => {
  const page    = Math.max(1, parseInt(req.query.page  ?? '1',   10));
  const perPage = Math.min(200, parseInt(req.query.limit ?? '50', 10));
  const offset  = (page - 1) * perPage;

  try {
    const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get().n;
    const rows  = db.prepare(`
      SELECT al.*, c.title AS conversation_title
      FROM audit_log al
      LEFT JOIN conversations c ON al.conversation_id = c.id
      ORDER BY al.ts DESC
      LIMIT ? OFFSET ?
    `).all(perPage, offset);

    res.json({
      total,
      page,
      perPage,
      pages: Math.ceil(total / perPage),
      rows,
    });
  } catch (err) {
    console.error('[admin] audit error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── GET /api/admin/folders ────────────────────────────────────────────────────

router.get('/folders', (req, res) => {
  try {
    const folders = db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM conversations c WHERE c.folder_id = f.id) AS conversation_count
      FROM folders f
      ORDER BY f.name COLLATE NOCASE
    `).all();
    res.json(folders);
  } catch (err) {
    console.error('[admin] folders list error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/admin/folders ───────────────────────────────────────────────────

router.post('/folders', (req, res) => {
  const { name, color = '#6366f1' } = req.body ?? {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: '`name` is required' });
  }

  const id = generateId();
  try {
    db.prepare(`INSERT INTO folders (id, name, color) VALUES (?, ?, ?)`).run(id, name.trim(), color);
    const folder = db.prepare(`SELECT * FROM folders WHERE id = ?`).get(id);
    res.status(201).json(folder);
  } catch (err) {
    console.error('[admin] folders create error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── PATCH /api/admin/folders/:id ─────────────────────────────────────────────

router.patch('/folders/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM folders WHERE id = ?`).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Not Found', message: 'Folder not found' });
  }

  const name  = req.body?.name  ?? existing.name;
  const color = req.body?.color ?? existing.color;

  try {
    db.prepare(`UPDATE folders SET name = ?, color = ? WHERE id = ?`).run(name, color, id);
    const folder = db.prepare(`SELECT * FROM folders WHERE id = ?`).get(id);
    res.json(folder);
  } catch (err) {
    console.error('[admin] folders update error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── DELETE /api/admin/folders/:id ────────────────────────────────────────────

router.delete('/folders/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM folders WHERE id = ?`).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Not Found', message: 'Folder not found' });
  }

  try {
    // Foreign key ON DELETE SET NULL will unlink conversations automatically
    db.prepare(`DELETE FROM folders WHERE id = ?`).run(id);
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[admin] folders delete error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/admin/vacuum ────────────────────────────────────────────────────

router.post('/vacuum', (req, res) => {
  try {
    // VACUUM cannot run inside a transaction
    db.exec('VACUUM');
    db.exec('ANALYZE');
    res.json({ ok: true, message: 'Database vacuumed and analyzed successfully.' });
  } catch (err) {
    console.error('[admin] vacuum error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/admin/import ────────────────────────────────────────────────────

router.post('/import', (req, res) => {
  const backup = req.body;

  if (!backup || typeof backup !== 'object') {
    return res.status(400).json({ error: 'Bad Request', message: 'Request body must be a JSON backup object' });
  }

  const { conversations = [], folders = [], settings = {}, promptLibrary = [] } = backup;

  if (!Array.isArray(conversations)) {
    return res.status(400).json({ error: 'Bad Request', message: '`conversations` must be an array' });
  }

  const stats = { conversations: 0, messages: 0, folders: 0, settings: 0, prompts: 0 };

  try {
    const importTx = db.transaction(() => {
      // Import folders first (conversations reference them)
      for (const folder of folders) {
        if (!folder.id || !folder.name) continue;
        db.prepare(`
          INSERT INTO folders (id, name, color, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color
        `).run(folder.id, folder.name, folder.color ?? '#6366f1', folder.created_at ?? new Date().toISOString());
        stats.folders++;
      }

      // Import conversations and their messages
      for (const conv of conversations) {
        if (!conv.id) continue;

        db.prepare(`
          INSERT INTO conversations (id, title, folder_id, system_prompt, model, pinned, ephemeral, created_at, updated_at)
          VALUES (@id, @title, @folder_id, @system_prompt, @model, @pinned, @ephemeral, @created_at, @updated_at)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            folder_id = excluded.folder_id,
            system_prompt = excluded.system_prompt,
            model = excluded.model,
            pinned = excluded.pinned,
            ephemeral = excluded.ephemeral,
            updated_at = excluded.updated_at
        `).run({
          id:            conv.id,
          title:         conv.title ?? 'Imported',
          folder_id:     conv.folder_id ?? null,
          system_prompt: conv.system_prompt ?? null,
          model:         conv.model ?? null,
          pinned:        conv.pinned ? 1 : 0,
          ephemeral:     conv.ephemeral ? 1 : 0,
          created_at:    conv.created_at ?? new Date().toISOString(),
          updated_at:    conv.updated_at ?? new Date().toISOString(),
        });
        stats.conversations++;

        for (const msg of conv.messages ?? []) {
          if (!msg.id || !msg.role) continue;
          db.prepare(`
            INSERT INTO messages
              (id, conversation_id, role, content, model, provider, attachments,
               excluded_from_context, token_input, token_output, cost_usd, created_at)
            VALUES
              (@id, @conversation_id, @role, @content, @model, @provider, @attachments,
               @excluded_from_context, @token_input, @token_output, @cost_usd, @created_at)
            ON CONFLICT(id) DO NOTHING
          `).run({
            id:                   msg.id,
            conversation_id:      conv.id,
            role:                 msg.role,
            content:              msg.content ?? '',
            model:                msg.model ?? null,
            provider:             msg.provider ?? null,
            attachments:          msg.attachments ? JSON.stringify(msg.attachments) : null,
            excluded_from_context: msg.excluded_from_context ? 1 : 0,
            token_input:          msg.token_input ?? null,
            token_output:         msg.token_output ?? null,
            cost_usd:             msg.cost_usd ?? null,
            created_at:           msg.created_at ?? new Date().toISOString(),
          });
          stats.messages++;
        }
      }

      // Import settings
      for (const [key, value] of Object.entries(settings)) {
        db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .run(key, String(value));
        stats.settings++;
      }

      // Import prompt library
      for (const prompt of promptLibrary) {
        if (!prompt.id || !prompt.name) continue;
        db.prepare(`
          INSERT INTO prompt_library (id, name, content, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content
        `).run(prompt.id, prompt.name, prompt.content ?? '', prompt.created_at ?? new Date().toISOString());
        stats.prompts++;
      }
    });

    importTx();

    res.json({ ok: true, imported: stats });
  } catch (err) {
    console.error('[admin] import error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
