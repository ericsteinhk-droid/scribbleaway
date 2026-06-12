import { Router } from 'express';
import db, { generateId } from '../db/database.js';

const router = Router();

// PATCH /api/messages/:id — update message (content, excluded_from_context)
router.patch('/messages/:id', (req, res) => {
  const { content, excludedFromContext } = req.body;
  const { id } = req.params;

  try {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!msg) return res.status(404).json({ error: 'Message introuvable' });

    const updates = [];
    const values = [];

    if (content !== undefined) { updates.push('content = ?'); values.push(content); }
    if (excludedFromContext !== undefined) { updates.push('excluded_from_context = ?'); values.push(excludedFromContext ? 1 : 0); }

    if (updates.length === 0) return res.json({ ok: true });

    values.push(id);
    db.prepare(`UPDATE messages SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    res.json({
      id: updated.id,
      role: updated.role,
      content: updated.content,
      excludedFromContext: updated.excluded_from_context === 1,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/messages/:id — delete single message
router.delete('/messages/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Message introuvable' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/messages — delete messages from a conversation after a given message
router.delete('/messages', (req, res) => {
  const { conversationId, afterMessageId } = req.body;
  if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

  try {
    if (afterMessageId) {
      const refMsg = db.prepare('SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?').get(afterMessageId, conversationId);
      if (!refMsg) return res.status(404).json({ error: 'Message de référence introuvable' });

      const result = db.prepare('DELETE FROM messages WHERE conversation_id = ? AND created_at > ?').run(conversationId, refMsg.created_at);
      res.json({ ok: true, deleted: result.changes });
    } else {
      const result = db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
      res.json({ ok: true, deleted: result.changes });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
