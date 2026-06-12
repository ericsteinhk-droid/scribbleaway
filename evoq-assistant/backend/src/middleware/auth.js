/**
 * Optional password-based authentication middleware for EVOQ Assistant.
 *
 * When APP_PASSWORD is set in the environment:
 *   - POST /api/auth/login  verifies the password and returns a session token
 *   - All other /api routes require a valid Bearer token (or x-app-password header)
 *
 * When APP_PASSWORD is NOT set, every request passes through freely.
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';

// ── In-memory session store ───────────────────────────────────────────────────
// Map<token, { expiresAt: number | null }>
const sessions = new Map();

// Session lifetime in milliseconds, parsed once at startup
const SESSION_TIMEOUT_MS = (() => {
  const minutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES ?? '60', 10);
  return minutes > 0 ? minutes * 60 * 1000 : 0;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Still do the comparison to avoid timing leak on length
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Create a new session token and store it.
 * @returns {string} The session token.
 */
function createSession() {
  const token = randomUUID();
  const expiresAt = SESSION_TIMEOUT_MS > 0 ? Date.now() + SESSION_TIMEOUT_MS : null;
  sessions.set(token, { expiresAt });
  return token;
}

/**
 * Validate a session token.
 * @param {string} token
 * @returns {boolean}
 */
function isValidSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;

  if (session.expiresAt !== null && Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }

  // Slide the expiry window on each successful use
  if (SESSION_TIMEOUT_MS > 0 && session.expiresAt !== null) {
    session.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
  }

  return true;
}

/**
 * Periodically clean up expired sessions (every 10 minutes).
 */
setInterval(() => {
  if (SESSION_TIMEOUT_MS === 0) return;
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt !== null && now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}, 10 * 60 * 1000).unref(); // .unref() so the timer doesn't keep Node alive

// ── Login handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { password: string }
 * Response: { token: string, expiresIn: number | null }
 *
 * @type {import('express').RequestHandler}
 */
export function loginHandler(req, res) {
  const appPassword = process.env.APP_PASSWORD;

  // If no password is configured the app is open — return a pseudo-token
  if (!appPassword) {
    return res.json({ token: 'no-auth', expiresIn: null });
  }

  const { password } = req.body ?? {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Bad Request', message: 'password is required' });
  }

  if (!safeCompare(password, appPassword)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid password' });
  }

  const token = createSession();
  const expiresIn = SESSION_TIMEOUT_MS > 0 ? SESSION_TIMEOUT_MS / 1000 : null;

  return res.json({ token, expiresIn });
}

/**
 * POST /api/auth/logout
 * Invalidates the current session token.
 *
 * @type {import('express').RequestHandler}
 */
export function logoutHandler(req, res) {
  const token = extractToken(req);
  if (token) sessions.delete(token);
  return res.json({ ok: true });
}

// ── Token extraction ──────────────────────────────────────────────────────────

/**
 * Extract the bearer token from the request.
 * Checks (in order):
 *   1. Authorization: Bearer <token>
 *   2. Authorization: Basic base64(<anything>:<token>)  (password field used as token)
 *   3. x-app-password header (raw token or password)
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'] ?? '';

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }

  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      // Format: "username:password" — we use the password field as the token
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        return decoded.slice(colonIdx + 1).trim() || null;
      }
    } catch {
      // Invalid base64 — fall through
    }
  }

  const headerPw = req.headers['x-app-password'];
  if (headerPw && typeof headerPw === 'string') {
    return headerPw.trim() || null;
  }

  return null;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

/**
 * Express middleware that enforces authentication when APP_PASSWORD is set.
 *
 * Routes excluded from protection:
 *   - POST /api/auth/login
 *   - GET  /api/health
 *
 * @type {import('express').RequestHandler}
 */
export function authMiddleware(req, res, next) {
  const appPassword = process.env.APP_PASSWORD;

  // Auth disabled — let everything through
  if (!appPassword) return next();

  // Public routes that don't require authentication
  const publicRoutes = [
    { method: 'POST', path: '/api/auth/login' },
    { method: 'GET',  path: '/api/health' },
  ];

  const isPublic = publicRoutes.some(
    (r) => r.method === req.method && req.path === r.path
  );

  if (isPublic) return next();

  // Check for a valid session token
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. POST /api/auth/login to obtain a token.',
    });
  }

  // If the raw token matches the password directly (convenience for API clients),
  // treat it as a valid credential and issue a short-lived session implicitly.
  if (safeCompare(token, appPassword)) {
    return next();
  }

  // Otherwise it must be a valid session UUID
  if (!isValidSession(token)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired session token.',
    });
  }

  return next();
}
