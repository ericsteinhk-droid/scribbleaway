/**
 * EVOQ Assistant — Express backend server
 *
 * Startup order:
 *   1. Load environment variables (.env)
 *   2. Open SQLite database and apply schema
 *   3. Configure security middleware (helmet, CORS, rate-limit)
 *   4. Mount routes
 *   5. Register global error handler
 *   6. Start listening
 *   7. Schedule background jobs (TTL cleanup)
 */

// ── Environment ───────────────────────────────────────────────────────────────
// Must come first so every subsequent import can read process.env.
// Try backend/.env first, then evoq-assistant/.env (one level up), then CWD.
import { config as _dotenvConfig } from 'dotenv';
import { resolve as _resolve, dirname as _dirname } from 'node:path';
import { fileURLToPath as _fileURLToPath } from 'node:url';

{
  const _d = _dirname(_fileURLToPath(import.meta.url));
  _dotenvConfig({ path: _resolve(_d, '../.env') });       // backend/.env
  _dotenvConfig({ path: _resolve(_d, '../../.env') });    // evoq-assistant/.env
  _dotenvConfig();                                         // process.cwd()/.env
}

// ── Core imports ──────────────────────────────────────────────────────────────
import express    from 'express';
import cors       from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Database (opens the connection and applies schema) ────────────────────────
import db from './db/database.js';

// ── Security middleware ───────────────────────────────────────────────────────
import { helmetMiddleware, rateLimiter } from './middleware/security.js';
import { authMiddleware }                from './middleware/auth.js';

// ── Routes ────────────────────────────────────────────────────────────────────
import chatRouter          from './routes/chat.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter      from './routes/messages.js';
import settingsRouter      from './routes/settings.js';
import exportRouter        from './routes/export.js';
import adminRouter         from './routes/admin.js';
import authRouter          from './routes/auth.js';
import uploadRouter        from './routes/upload.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? 'localhost';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────

app.use(helmetMiddleware);

// ── CORS ──────────────────────────────────────────────────────────────────────

const rawOrigins  = process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000';
const allowedOrigins = rawOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Password'],
}));

// ── Rate limiting on /api ──────────────────────────────────────────────────────

app.use('/api', rateLimiter);

// ── Auth middleware ───────────────────────────────────────────────────────────
// Applied after CORS so pre-flight OPTIONS requests are not blocked.

app.use('/api', authMiddleware);

// ── Body parsers ──────────────────────────────────────────────────────────────

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Health check (no auth, no rate limit) ─────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
  });
});

// ── Static files ──────────────────────────────────────────────────────────────
// Serve anything placed in backend/public (e.g. favicon, robots.txt)

const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api/auth',          authRouter);
app.use('/api/chat',          chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages',      messagesRouter);
app.use('/api/settings',      settingsRouter);
app.use('/api/export',        exportRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/upload',        uploadRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error:   'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});

// ── Global error handler ──────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status  = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? 'An unexpected error occurred';

  if (status >= 500) {
    console.error('[server] unhandled error:', err);
  }

  // Don't leak stack traces in production
  const body = {
    error:   status === 500 ? 'Internal Server Error' : (err.name ?? 'Error'),
    message,
  };

  if (process.env.NODE_ENV === 'development' && err.stack) {
    body.stack = err.stack;
  }

  res.status(status).json(body);
});

// ── TTL cleanup ───────────────────────────────────────────────────────────────

/**
 * Delete conversations (and their messages, via CASCADE) older than
 * CONVERSATION_TTL_DAYS days.  Runs at startup and then hourly.
 */
function runTTLCleanup() {
  const ttlDays = parseInt(process.env.CONVERSATION_TTL_DAYS ?? '0', 10);
  if (ttlDays <= 0) return; // TTL disabled

  try {
    const result = db.prepare(`
      DELETE FROM conversations
      WHERE updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ? || ' days')
        AND ephemeral = 0
    `).run(`-${ttlDays}`);

    if (result.changes > 0) {
      console.log(`[TTL] Deleted ${result.changes} conversation(s) older than ${ttlDays} day(s).`);
    }
  } catch (err) {
    console.error('[TTL] cleanup error:', err.message);
  }
}

// Run once at startup, then schedule hourly
runTTLCleanup();
const ttlTimer = setInterval(runTTLCleanup, 60 * 60 * 1000);
ttlTimer.unref(); // Don't keep process alive just for this timer

// ── Listen ────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`\nEVOQ Assistant backend running at ${url}`);
  console.log(`  Health:  ${url}/api/health`);
  console.log(`  Auth:    ${process.env.APP_PASSWORD ? 'enabled' : 'disabled'}`);
  console.log(`  DB:      ${process.env.DB_PATH ?? './data/evoq-assistant.db'}`);
  console.log(`  CORS:    ${allowedOrigins.join(', ')}\n`);
});

export default app;
