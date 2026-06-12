/**
 * Export routes.
 *
 * GET  /api/export/conversation/:id        - Export a single conversation (JSON | MD | TXT)
 * POST /api/export/conversations           - Export multiple conversations as ZIP
 * GET  /api/export/all                     - Export entire database as JSON backup
 */

import { Router }    from 'express';
import archiver      from 'archiver';
import db, { fromJson } from '../db/database.js';

const router = Router();

// ── Prepared statements ───────────────────────────────────────────────────────

const getConversation = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
const getMessages     = db.prepare(`
  SELECT * FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at ASC
`);
const listAllConversations = db.prepare(`
  SELECT * FROM conversations ORDER BY updated_at DESC
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a Markdown string for a conversation + its messages.
 */
function toMarkdown(conversation, messages) {
  const lines = [];
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`- **Created:** ${conversation.created_at}`);
  lines.push(`- **Updated:** ${conversation.updated_at}`);
  if (conversation.model)  lines.push(`- **Model:** ${conversation.model}`);
  if (conversation.system_prompt) {
    lines.push('');
    lines.push('## System Prompt');
    lines.push('');
    lines.push(conversation.system_prompt);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '**You**' : `**${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}**`;
    lines.push(`### ${roleLabel}`);
    lines.push(`*${msg.created_at}*`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build a plain-text string for a conversation + its messages.
 */
function toPlainText(conversation, messages) {
  const lines = [];
  lines.push(conversation.title);
  lines.push('='.repeat(conversation.title.length));
  lines.push('');
  lines.push(`Created: ${conversation.created_at}`);
  lines.push(`Updated: ${conversation.updated_at}`);
  if (conversation.model) lines.push(`Model: ${conversation.model}`);
  if (conversation.system_prompt) {
    lines.push('');
    lines.push('SYSTEM PROMPT');
    lines.push('-'.repeat(13));
    lines.push(conversation.system_prompt);
  }
  lines.push('');

  for (const msg of messages) {
    const roleLabel = msg.role.toUpperCase();
    lines.push(`[${roleLabel}] ${msg.created_at}`);
    lines.push(msg.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Sanitize a string for use in a filename.
 */
function safeFilename(str) {
  return str
    .replace(/[^a-z0-9_\-\s]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

// ── GET /api/export/conversation/:id ─────────────────────────────────────────

router.get('/conversation/:id', (req, res) => {
  const { id } = req.params;
  const format = (req.query.format ?? 'json').toLowerCase();

  const conversation = getConversation.get(id);
  if (!conversation) {
    return res.status(404).json({ error: 'Not Found', message: 'Conversation not found' });
  }

  const messages = getMessages.all(id);
  const basename = safeFilename(conversation.title || id);

  try {
    if (format === 'json') {
      const payload = {
        exportedAt: new Date().toISOString(),
        conversation: {
          ...conversation,
          messages: messages.map(m => ({ ...m, attachments: fromJson(m.attachments) })),
        },
      };
      res.setHeader('Content-Disposition', `attachment; filename="${basename}.json"`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.json(payload);
    }

    if (format === 'md' || format === 'markdown') {
      const md = toMarkdown(conversation, messages);
      res.setHeader('Content-Disposition', `attachment; filename="${basename}.md"`);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.send(md);
    }

    if (format === 'txt' || format === 'text') {
      const txt = toPlainText(conversation, messages);
      res.setHeader('Content-Disposition', `attachment; filename="${basename}.txt"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(txt);
    }

    return res.status(400).json({
      error: 'Bad Request',
      message: `Unknown format "${format}". Valid: json, md, txt`,
    });
  } catch (err) {
    console.error('[export] single conversation error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/export/conversations ────────────────────────────────────────────

router.post('/conversations', (req, res) => {
  const { ids, format = 'json' } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: '`ids` array is required' });
  }

  const validFormats = ['json', 'md', 'txt'];
  const fmt = format.toLowerCase();
  if (!validFormats.includes(fmt)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Unknown format "${format}". Valid: ${validFormats.join(', ')}`,
    });
  }

  try {
    res.setHeader('Content-Disposition', `attachment; filename="evoq-export-${Date.now()}.zip"`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('[export] archiver error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error', message: err.message });
      }
    });

    archive.pipe(res);

    for (const id of ids) {
      const conversation = getConversation.get(id);
      if (!conversation) continue;

      const messages  = getMessages.all(id);
      const basename  = safeFilename(conversation.title || id);

      let content;
      let ext;

      if (fmt === 'json') {
        content = JSON.stringify({
          exportedAt: new Date().toISOString(),
          conversation: {
            ...conversation,
            messages: messages.map(m => ({ ...m, attachments: fromJson(m.attachments) })),
          },
        }, null, 2);
        ext = 'json';
      } else if (fmt === 'md') {
        content = toMarkdown(conversation, messages);
        ext = 'md';
      } else {
        content = toPlainText(conversation, messages);
        ext = 'txt';
      }

      archive.append(Buffer.from(content, 'utf-8'), { name: `${basename}_${id.slice(0, 8)}.${ext}` });
    }

    archive.finalize();
  } catch (err) {
    console.error('[export] bulk export error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
});

// ── GET /api/export/all ───────────────────────────────────────────────────────

router.get('/all', (req, res) => {
  try {
    const conversations = listAllConversations.all();
    const full = conversations.map(c => ({
      ...c,
      messages: getMessages.all(c.id).map(m => ({
        ...m,
        attachments: fromJson(m.attachments),
      })),
    }));

    const folders  = db.prepare(`SELECT * FROM folders ORDER BY name`).all();
    const settings = db.prepare(`SELECT * FROM settings ORDER BY key`).all();
    const prompts  = db.prepare(`SELECT * FROM prompt_library ORDER BY name`).all();

    const payload = {
      exportedAt:    new Date().toISOString(),
      version:       '1.0.0',
      conversations: full,
      folders,
      settings:      Object.fromEntries(settings.map(s => [s.key, s.value])),
      promptLibrary: prompts,
    };

    res.setHeader('Content-Disposition', `attachment; filename="evoq-full-backup-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(payload);
  } catch (err) {
    console.error('[export] full backup error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
