import { auth } from 'express-oauth2-jwt-bearer';

/**
 * Creates authentication middlewares for both the web session and first-party API
 */
export function setupAuth(config = {}) {
  const isAuth0 = config.AUTH_MODE === 'auth0' && Boolean(config.ISSUER_BASE_URL && config.CLIENT_ID);

  if (!isAuth0) {
    // Deterministic Mock Auth for Local Development and Tests
    const mockUser = {
      sub: config.MOCK_SUB || 'auth0|demo-user-123',
      name: config.MOCK_NAME || 'Jane Doe',
      email: config.MOCK_EMAIL || 'jane.doe@example.com',
      nickname: 'janedoe'
    };

    const mockAccessToken = 'mock_jwt_token_for_api_audience_https_api_assistant_local';

    return {
      mode: 'mock',
      // Web session auth middleware - simulates an authenticated user
      webSessionMiddleware: (req, res, next) => {
        // Allow switching mock user via query or header if desired in tests
        const activeSub = req.headers['x-mock-user-sub'] || req.query?.mockSub || mockUser.sub;
        req.oidc = {
          isAuthenticated: () => true,
          user: {
            ...mockUser,
            sub: activeSub
          },
          getAccessToken: async () => ({
            access_token: `mock_jwt_token_for_${activeSub}`
          })
        };
        next();
      },
      // First-party API bearer token validation middleware
      apiAuthMiddleware: (req, res, next) => {
        const authHeader = req.headers.authorization;
        let sub = mockUser.sub;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          // Extract sub if formatted as mock_jwt_token_for_<sub...>
          if (token.startsWith('mock_jwt_token_for_')) {
            sub = token.replace('mock_jwt_token_for_', '');
          }
        } else if (req.headers['x-mock-user-sub']) {
          sub = req.headers['x-mock-user-sub'];
        }

        req.auth = {
          payload: {
            sub,
            iss: 'https://mock.auth0.local/',
            aud: config.API_AUDIENCE || 'https://api.assistant.local',
            scope: 'read:settings write:settings'
          },
          token: authHeader?.substring(7) || mockAccessToken
        };
        next();
      }
    };
  }

  // Real Auth0 Configuration
  const apiAuthMiddleware = auth({
    audience: config.API_AUDIENCE || 'https://api.assistant.local',
    issuerBaseURL: config.ISSUER_BASE_URL,
    tokenSigningAlg: 'RS256'
  });

  return {
    mode: 'auth0',
    webSessionMiddleware: null, // Will be handled by express-openid-connect in main app
    apiAuthMiddleware
  };
}
