import 'dotenv/config';
import { createApp } from './app.js';

const config = {
  PORT: process.env.PORT || 3000,
  AUTH_MODE: process.env.AUTH_MODE || 'mock',
  ISSUER_BASE_URL: process.env.ISSUER_BASE_URL,
  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  SECRET: process.env.SECRET || 'development_mock_session_secret_32chars_long_minimum',
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  API_AUDIENCE: process.env.API_AUDIENCE || 'https://api.assistant.local',
  TOKEN_VAULT_ENABLED: process.env.TOKEN_VAULT_ENABLED === 'true'
};

const app = createApp(config);
const port = config.PORT;

app.listen(port, () => {
  console.log(`=======================================================`);
  console.log(`🤖 Context-Preserving Assistant running on http://localhost:${port}`);
  console.log(`🔐 Authentication Mode: ${config.AUTH_MODE.toUpperCase()}`);
  console.log(`🎯 API Audience: ${config.API_AUDIENCE}`);
  console.log(`=======================================================`);
});
