/**
 * POST /api/chat
 *
 * Streams a chat completion from the selected provider (anthropic | openai | gemini).
 * Uses Server-Sent Events so the client can render tokens as they arrive.
 *
 * Request body (JSON):
 *   {
 *     provider:       'anthropic' | 'openai' | 'gemini'    (default: 'anthropic')
 *     model:          string                                (provider-specific model ID)
 *     messages:       [{ role, content }]                   (required)
 *     systemPrompt:   string
 *     temperature:    number
 *     maxTokens:      number
 *     conversationId: string                               (optional — for DB persistence)
 *     attachments:    [{type, name, mimeType, data}]       (base64 files)
 *   }
 *
 * SSE events emitted:
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done","inputTokens":N,"outputTokens":N,"cost":N}
 *   data: {"type":"error","message":"..."}
 */

import { Router } from 'express';
import db, { generateId, toJson } from '../db/database.js';
import { streamChat as anthropicStream } from '../providers/anthropic.js';
import { streamChat as openaiStream  } from '../providers/openai.js';
import { streamChat as geminiStream  } from '../providers/gemini.js';

const router = Router();

// ── Provider routing ──────────────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: anthropicStream,
  openai:    openaiStream,
  gemini:    geminiStream,
};

// ── Token cost estimation (USD per 1M tokens) ─────────────────────────────────
// These are approximate — kept conservative so cost estimates are never wildly off.
const COST_PER_M = {
  // Anthropic
  'claude-opus-4-5-20251101':        { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5-20251101':      { input:  3.00, output: 15.00 },
  'claude-3-5-haiku-20241022':       { input:  0.80, output:  4.00 },
  'claude-3-5-sonnet-20241022':      { input:  3.00, output: 15.00 },
  'claude-3-opus-20240229':          { input: 15.00, output: 75.00 },
  // OpenAI
  'gpt-4o':                          { input:  5.00, output: 15.00 },
  'gpt-4o-mini':                     { input:  0.15, output:  0.60 },
  'gpt-4-turbo':                     { input: 10.00, output: 30.00 },
  'o1-preview':                      { input: 15.00, output: 60.00 },
  'o1-mini':                         { input:  3.00, output: 12.00 },
  // Gemini
  'gemini-2.5-flash-preview-05-20':  { input:  0.15, output:  0.60 },
  'gemini-1.5-pro':                  { input:  3.50, output: 10.50 },
  'gemini-1.5-flash':                { input:  0.075, output: 0.30 },
};

/**
 * Estimate cost in USD for a given model and token counts.
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number}
 */
function estimateCost(model, inputTokens, outputTokens) {
  const rates = COST_PER_M[model];
  if (!rates) return 0;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

// ── Prepared statements ───────────────────────────────────────────────────────

const insertMessage = db.prepare(`
  INSERT INTO messages
    (id, conversation_id, role, content, model, provider, attachments,
     token_input, token_output, cost_usd, created_at)
  VALUES
    (@id, @conversation_id, @role, @content, @model, @provider, @attachments,
     @token_input, @token_output, @cost_usd, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
`);

const insertAuditLog = db.prepare(`
  INSERT INTO audit_log (provider, model, token_input, token_output, conversation_id)
  VALUES (@provider, @model, @token_input, @token_output, @conversation_id)
`);

const updateConversationTitle = db.prepare(`
  UPDATE conversations SET title = @title, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = @id AND title = 'New Conversation'
`);

// ── POST /api/chat ────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const {
    provider      = 'anthropic',
    model,
    messages      = [],
    systemPrompt,
    temperature,
    maxTokens,
    conversationId,
    attachments   = [],
  } = req.body ?? {};

  // Validate provider
  const streamFn = PROVIDERS[provider];
  if (!streamFn) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Unknown provider "${provider}". Valid: ${Object.keys(PROVIDERS).join(', ')}`,
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: '`messages` array is required' });
  }

  // ── Set up SSE ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  const sendEvent = (data) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // ── Abort on client disconnect ──────────────────────────────────────────────
  // IMPORTANT: listen on `res`, not `req`. With body-parsing middleware the
  // request stream's 'close' event fires as soon as the request body has been
  // consumed (Node 16+), which would abort the provider call before it streams
  // a single token. The response stream only closes on a genuine client
  // disconnect, and the `finished` flag prevents a self-inflicted abort once we
  // have ended the response normally.
  const abortController = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) abortController.abort();
  });

  // ── Accumulate the full response for DB persistence ─────────────────────────
  let fullContent = '';

  try {
    // Persist the user message if conversationId is provided
    if (conversationId) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const userText = typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : lastUserMsg.content?.map?.(b => b.text ?? '').join('') ?? '';

        // Auto-set conversation title from first user message (truncated to 80 chars)
        if (userText) {
          const autoTitle = userText.slice(0, 80).replace(/\s+/g, ' ').trim();
          updateConversationTitle.run({ id: conversationId, title: autoTitle });
        }

        insertMessage.run({
          id:              generateId(),
          conversation_id: conversationId,
          role:            'user',
          content:         userText,
          model:           model ?? null,
          provider,
          attachments:     attachments.length > 0
            ? toJson(attachments.map(a => ({ type: a.type, name: a.name, mimeType: a.mimeType })))
            : null,
          token_input:     null,
          token_output:    null,
          cost_usd:        null,
        });
      }
    }

    // ── Stream from provider ──────────────────────────────────────────────────
    await streamFn(
      { messages, model, systemPrompt, temperature, maxTokens, attachments },
      // onChunk
      (text) => {
        fullContent += text;
        sendEvent({ type: 'delta', text });
      },
      // onDone
      ({ inputTokens, outputTokens }) => {
        const cost = estimateCost(model ?? '', inputTokens, outputTokens);

        // Persist assistant message and audit log if we have a conversationId
        if (conversationId) {
          insertMessage.run({
            id:              generateId(),
            conversation_id: conversationId,
            role:            'assistant',
            content:         fullContent,
            model:           model ?? null,
            provider,
            attachments:     null,
            token_input:     inputTokens,
            token_output:    outputTokens,
            cost_usd:        cost > 0 ? cost : null,
          });

          insertAuditLog.run({
            provider,
            model:           model ?? null,
            token_input:     inputTokens,
            token_output:    outputTokens,
            conversation_id: conversationId,
          });
        }

        finished = true;
        sendEvent({ type: 'done', inputTokens, outputTokens, cost });
        res.end();
      },
      abortController.signal,
    );

    // Safety net: if the provider returned without ever calling onDone
    // (e.g. an empty completion), make sure we still close the SSE stream
    // instead of leaving the client hanging.
    if (!res.writableEnded) {
      finished = true;
      sendEvent({ type: 'done', inputTokens: 0, outputTokens: 0, cost: 0 });
      res.end();
    }
  } catch (err) {
    finished = true;
    if (!abortController.signal.aborted) {
      console.error('[chat] streaming error:', err.message);
      sendEvent({ type: 'error', message: err.message ?? 'Streaming failed' });
    }
    if (!res.writableEnded) res.end();
  }
});

// ── Title generation endpoint ─────────────────────────────────────────────────

router.post('/title', async (req, res) => {
  const { provider = 'anthropic', model, message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: 'message requis' });

  const streamFn = PROVIDERS[provider];
  if (!streamFn) return res.status(400).json({ error: 'fournisseur invalide' });

  const titlePrompt = `Génère un titre très court (5 mots maximum, pas de ponctuation) en français pour une conversation qui commence par ce message:\n\n"${message.slice(0, 300)}"`;
  let title = '';

  try {
    await streamFn(
      {
        model: model || undefined,
        messages: [{ role: 'user', content: titlePrompt }],
        systemPrompt: 'Réponds uniquement avec le titre, sans guillemets ni ponctuation finale.',
        temperature: 0.4,
        maxTokens: 20,
      },
      (chunk) => { title += chunk; },
      () => {},
      (err) => { title = err; },
      new AbortController().signal,
    );
    res.json({ title: title.trim().replace(/^["']|["']$/g, '').slice(0, 60) });
  } catch (err) {
    res.json({ title: message.slice(0, 50) });
  }
});

export default router;

