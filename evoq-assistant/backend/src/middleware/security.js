/**
 * Security middleware for EVOQ Assistant backend.
 * Provides HTTP security headers (via helmet) and API rate limiting.
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ── Helmet / CSP ──────────────────────────────────────────────────────────────

/**
 * Strict Content Security Policy and security-header configuration.
 *
 * - default-src 'self'          : only same-origin by default
 * - script-src 'self'           : no inline scripts, no eval
 * - style-src 'self' unsafe-inline : allow inline styles (needed by many UI libs)
 * - font-src 'self'             : local fonts only
 * - img-src 'self' data: blob:  : allow data URIs and blob URLs for file previews
 * - connect-src 'self'          : XHR/fetch to same origin only
 * - frame-ancestors 'none'      : forbid being embedded in a frame
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src':     ["'self'"],
      'script-src':      ["'self'"],
      'style-src':       ["'self'", "'unsafe-inline'"],
      'font-src':        ["'self'"],
      'img-src':         ["'self'", 'data:', 'blob:'],
      'connect-src':     ["'self'"],
      'frame-ancestors': ["'none'"],
      'object-src':      ["'none'"],
      'base-uri':        ["'self'"],
      'form-action':     ["'self'"],
    },
  },

  // Strict-Transport-Security (HSTS) — only meaningful on HTTPS
  hsts: {
    maxAge: 31_536_000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options: DENY — belt-and-suspenders alongside frame-ancestors
  frameguard: { action: 'deny' },

  // X-Content-Type-Options: nosniff
  noSniff: true,

  // Referrer-Policy: no-referrer
  referrerPolicy: { policy: 'no-referrer' },

  // X-DNS-Prefetch-Control: off
  dnsPrefetchControl: { allow: false },

  // Disable X-Powered-By
  hidePoweredBy: true,

  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: { policy: 'same-origin' },

  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: { policy: 'same-origin' },

  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: false, // keep false to avoid breaking API fetches
});

// ── Rate Limiter ──────────────────────────────────────────────────────────────

/**
 * Rate limiter applied to all /api routes.
 * 100 requests per minute per IP address.
 * Responds with a structured JSON error when the limit is exceeded.
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: 'draft-7', // Return RateLimit-* headers (RFC 6585 draft-7)
  legacyHeaders: false,

  // Custom JSON error response
  handler(req, res, _next, options) {
    res.status(options.statusCode).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Maximum ${options.max} requests per minute.`,
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },

  // Skip rate-limiting for health-check endpoint
  skip(req) {
    return req.path === '/api/health';
  },
});
