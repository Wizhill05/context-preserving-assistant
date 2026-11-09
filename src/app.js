import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import authPkg from 'express-openid-connect';
const { auth: oidcAuth, requiresAuth } = authPkg;

import { setupAuth } from './services/authMiddleware.js';
import { createFirstPartyApiRouter } from './services/firstPartyApi.js';
import { defaultSettingsStore } from './services/settingsStore.js';
import { processAssistantMessage, defaultSessionManager } from './services/assistantEngine.js';
import { defaultTokenVault } from './services/tokenVault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(config = {}) {
  const app = express();
  const authSetup = setupAuth(config);
  const settingsStore = config.settingsStore || defaultSettingsStore;
  const tokenVault = config.tokenVault || defaultTokenVault;
  const sessionManager = config.sessionManager || defaultSessionManager;
  const weatherFetcher = config.weatherFetcher || globalThis.fetch;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files for Chat UI
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // Configure Web User Authentication
  if (authSetup.mode === 'auth0') {
    // Real Auth0 Universal Login via express-openid-connect
    app.use(
      oidcAuth({
        authRequired: false,
        auth0Logout: true,
        issuerBaseURL: config.ISSUER_BASE_URL,
        baseURL: config.BASE_URL || `http://localhost:${config.PORT || 3000}`,
        clientID: config.CLIENT_ID,
        clientSecret: config.CLIENT_SECRET,
        secret: config.SECRET,
        authorizationParams: {
          response_type: 'code',
          audience: config.API_AUDIENCE || 'https://api.assistant.local',
          scope: 'openid profile email read:settings write:settings'
        }
      })
    );
  } else {
    // Development / Mock Authenticator
    app.use(authSetup.webSessionMiddleware);
  }

  // Identity / session introspection endpoint (used by UI to render active identity)
  app.get('/api/identity', (req, res) => {
    const user = req.oidc?.user || {
      sub: 'auth0|demo-user-123',
      name: 'Jane Doe',
      email: 'jane.doe@example.com'
    };
    return res.json({
      mode: authSetup.mode,
      audience: config.API_AUDIENCE || 'https://api.assistant.local',
      user
    });
  });

  // 1. Mount First-Party API Router (/api/settings, etc.) protected by JWT bearer auth
  const firstPartyRouter = createFirstPartyApiRouter({
    authMiddleware: authSetup.apiAuthMiddleware,
    store: settingsStore
  });
  app.use('/api', firstPartyRouter);

  // 2. Assistant Chat Interaction Endpoint (/api/assistant/chat)
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const { sessionId, message } = req.body || {};
      if (!message) {
        return res.status(400).json({ error: 'Missing message parameter' });
      }

      // Extract user context from the authenticated web session
      const user = req.oidc?.user || {
        sub: req.headers['x-mock-user-sub'] || 'auth0|demo-user-123',
        name: 'Jane Doe',
        email: 'jane.doe@example.com'
      };

      let accessToken = null;
      if (req.oidc?.getAccessToken) {
        try {
          const tokenRes = await req.oidc.getAccessToken();
          accessToken = tokenRes?.access_token;
        } catch (err) {
          // Token retrieval error fallback
          accessToken = 'session_bound_token';
        }
      } else {
        accessToken = `mock_jwt_token_for_${user.sub}`;
      }

      const assistantResult = await processAssistantMessage({
        sessionId: sessionId || `ses_${user.sub}`,
        message,
        userContext: {
          ...user,
          accessToken
        },
        settingsStore,
        tokenVault,
        weatherFetcher,
        sessionManager
      });

      return res.json(assistantResult);
    } catch (err) {
      console.error('Error in /api/assistant/chat:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: err.message
      });
    }
  });

  // Optional: Pluggable Token Vault direct introspection endpoint
  app.get('/api/vault/provider-token', async (req, res) => {
    const user = req.oidc?.user || { sub: 'auth0|demo-user-123' };
    const provider = req.query.provider || 'google-calendar';
    try {
      const result = await tokenVault.getProviderToken({
        userId: user.sub,
        provider,
        scopes: ['calendar.readonly']
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve UI for base route
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
