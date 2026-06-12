/**
 * Auth routes.
 *
 * POST /api/auth/login   - Authenticate with APP_PASSWORD, returns session token
 * POST /api/auth/logout  - Invalidate current session token
 * GET  /api/auth/status  - Check if auth is enabled and current session is valid
 */

import { Router } from 'express';
import { loginHandler, logoutHandler, authMiddleware } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login — public route (excluded by authMiddleware)
router.post('/login', loginHandler);

// POST /api/auth/logout — invalidates current session
router.post('/logout', logoutHandler);

/**
 * GET /api/auth/status
 * Returns whether password protection is enabled, and whether the current
 * request is authenticated (useful for the frontend to decide whether to show
 * the login screen).
 */
router.get('/status', (req, res) => {
  const authEnabled = Boolean(process.env.APP_PASSWORD);

  if (!authEnabled) {
    return res.json({ authEnabled: false, authenticated: true });
  }

  // Re-use the authMiddleware inline to check authentication silently
  // (we don't want to return 401 here, just a boolean)
  let authenticated = false;

  authMiddleware(req, { status: () => ({ json: () => {} }) }, () => {
    authenticated = true;
  });

  // The middleware might return 401 — in that case `authenticated` stays false.
  // We detect this by checking if the next() callback was called.
  return res.json({ authEnabled, authenticated });
});

export default router;
