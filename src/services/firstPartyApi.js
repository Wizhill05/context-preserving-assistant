import express from 'express';
import { defaultSettingsStore } from './settingsStore.js';

/**
 * Creates the First-Party API Router
 *
 * @param {Object} options
 * @param {Function} options.authMiddleware - express middleware that validates access tokens and populates req.auth
 * @param {import('./settingsStore.js').SettingsStore} [options.store] - settings store instance
 */
export function createFirstPartyApiRouter({ authMiddleware, store = defaultSettingsStore }) {
  const router = express.Router();

  // All endpoints under this router require authentication
  if (authMiddleware) {
    router.use(authMiddleware);
  }

  // GET /api/settings - Retrieve authenticated user's settings
  router.get('/settings', (req, res) => {
    // req.auth is provided by express-oauth2-jwt-bearer (or mock auth in dev)
    const sub = req.auth?.payload?.sub || req.auth?.sub;
    if (!sub) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid token subject claim (sub)'
      });
    }

    const profile = store.getProfile(sub);
    return res.json({
      success: true,
      data: profile,
      meta: {
        issuer: req.auth?.payload?.iss || 'local',
        audience: req.auth?.payload?.aud || 'https://api.assistant.local',
        subject: sub,
        retrievedAt: new Date().toISOString()
      }
    });
  });

  // PUT /api/settings - Update authenticated user's settings
  router.put('/settings', express.json(), (req, res) => {
    const sub = req.auth?.payload?.sub || req.auth?.sub;
    if (!sub) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid token subject claim (sub)'
      });
    }

    const { homeCity, temperatureUnit, theme, name, bio } = req.body || {};
    const updates = {};
    if (homeCity !== undefined) updates.homeCity = String(homeCity).trim();
    if (temperatureUnit !== undefined) {
      const unit = String(temperatureUnit).toLowerCase();
      if (['celsius', 'fahrenheit'].includes(unit)) {
        updates.temperatureUnit = unit;
      }
    }
    if (theme !== undefined) updates.theme = String(theme);
    if (name !== undefined) updates.name = String(name);
    if (bio !== undefined) updates.bio = String(bio);

    const updatedProfile = store.updateProfile(sub, updates);
    return res.json({
      success: true,
      data: updatedProfile,
      meta: {
        subject: sub,
        updatedAt: new Date().toISOString()
      }
    });
  });

  return router;
}
