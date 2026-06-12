import { Router } from 'express';
import db from '../db/database.js';
import { generateId } from '../db/database.js';

const router = Router();

const DEFAULT_SETTINGS = {
  defaultModel: 'claude-opus-4-5-20251101',
  defaultProvider: 'anthropic',
  defaultSystemPrompt: '',
  temperature: '0.7',
  maxTokens: '4096',
  contextStrategy: 'all',
  contextLastN: '20',
  sessionTimeoutMin: '60',
  convTtlDays: '0',
  maxFileSizeMb: '10',
  claudeModel: 'claude-opus-4-5-20251101',
  gptModel: 'gpt-4o',
  geminiModel: 'gemini-2.5-flash-preview-05-20',
  geminiImageModel: 'gemini-2.5-flash-preview-05-20',
  darkMode: 'false',
};

// GET /api/settings
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/settings — upsert one or many settings
router.post('/settings', (req, res) => {
  const updates = req.body;
  if (typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Body must be a key-value object' });
  }

  try {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const upsertMany = db.transaction((entries) => {
      for (const [key, value] of entries) {
        upsert.run(key, String(value));
      }
    });

    upsertMany(Object.entries(updates));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Prompt Library ─────────────────────────────────────────────────────────────

// GET /api/prompts
router.get('/prompts', (req, res) => {
  try {
    const prompts = db.prepare('SELECT * FROM prompt_library ORDER BY name ASC').all();
    res.json(prompts.map(p => ({
      id: p.id,
      name: p.name,
      content: p.content,
      createdAt: p.created_at,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/prompts
router.post('/prompts', (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });

  try {
    const id = generateId();
    db.prepare('INSERT INTO prompt_library (id, name, content, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, content, Date.now());

    const prompt = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(id);
    res.status(201).json({ id: prompt.id, name: prompt.name, content: prompt.content, createdAt: prompt.created_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/prompts/:id
router.patch('/prompts/:id', (req, res) => {
  const { name, content } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);

  try {
    db.prepare(`UPDATE prompt_library SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const prompt = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(req.params.id);
    res.json({ id: prompt.id, name: prompt.name, content: prompt.content, createdAt: prompt.created_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/prompts/:id
router.delete('/prompts/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM prompt_library WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
