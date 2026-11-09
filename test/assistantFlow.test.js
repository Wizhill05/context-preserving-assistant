import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { SettingsStore } from '../src/services/settingsStore.js';
import { TokenVaultAdapter } from '../src/services/tokenVault.js';
import { SessionManager } from '../src/services/assistantEngine.js';

describe('Context-Preserving Assistant Conversation Flow & Integration', () => {
  let settingsStore;
  let tokenVault;
  let sessionManager;
  let app;
  let server;
  let baseUrl;

  const mockWeatherFetch = async (url) => {
    return {
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 29.0,
          relative_humidity_2m: 75,
          apparent_temperature: 32.5,
          weather_code: 0,
          wind_speed_10m: 11.5,
          time: '2026-11-09T12:00'
        }
      })
    };
  };

  before(async () => {
    settingsStore = new SettingsStore({
      'auth0|user-mangalore': {
        sub: 'auth0|user-mangalore',
        name: 'Priya Sharma',
        email: 'priya@example.com',
        homeCity: 'Mangalore',
        temperatureUnit: 'celsius',
        theme: 'dark'
      }
    });

    tokenVault = new TokenVaultAdapter({ enabled: false });
    sessionManager = new SessionManager();

    app = createApp({
      AUTH_MODE: 'mock',
      MOCK_SUB: 'auth0|user-mangalore',
      MOCK_NAME: 'Priya Sharma',
      MOCK_EMAIL: 'priya@example.com',
      API_AUDIENCE: 'https://api.assistant.local',
      settingsStore,
      tokenVault,
      sessionManager,
      weatherFetcher: mockWeatherFetch
    });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('Single conversation flow preserves context: First-Party profile -> Third-Party weather', async () => {
    const sessionId = 'ses_conversation_test_1';

    const chatRes = await fetch(`${baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-user-sub': 'auth0|user-mangalore'
      },
      body: JSON.stringify({
        sessionId,
        message: 'What is the weather in my home city?'
      })
    });

    assert.equal(chatRes.status, 200);
    const chatData = await chatRes.json();

    // Verify context preservation assertions
    assert.equal(chatData.context.authenticated, true);
    assert.equal(chatData.context.sub, 'auth0|user-mangalore');
    assert.equal(chatData.context.homeCity, 'Mangalore');

    // Verify both First-Party and Third-Party actions were taken in this single turn
    const firstPartyAction = chatData.actions.find(a => a.type === 'FIRST_PARTY_API_CALL');
    assert.ok(firstPartyAction, 'Must have called First-Party API');
    assert.equal(firstPartyAction.resolvedContext.homeCity, 'Mangalore');

    const thirdPartyAction = chatData.actions.find(a => a.type === 'THIRD_PARTY_API_CALL');
    assert.ok(thirdPartyAction, 'Must have called Third-Party API');
    assert.equal(thirdPartyAction.provider, 'Open-Meteo');
    assert.equal(thirdPartyAction.city, 'Mangalore');

    // Verify reply references home city and temperature
    assert.match(chatData.reply, /Mangalore/i);
    assert.match(chatData.reply, /29/i);
  });

  test('Multi-turn conversation flow: update home city setting, then check weather again', async () => {
    const sessionId = 'ses_conversation_test_2';

    // Turn 1: Update home city in first-party API
    const updateRes = await fetch(`${baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-user-sub': 'auth0|user-mangalore'
      },
      body: JSON.stringify({
        sessionId,
        message: 'Change my home city to London'
      })
    });

    const updateData = await updateRes.json();
    assert.match(updateData.reply, /London/i);

    // Verify that the First-Party API store was updated for this user's sub
    assert.equal(settingsStore.getProfile('auth0|user-mangalore').homeCity, 'London');

    // Turn 2: Ask for weather in home city again - should now automatically query London
    const weatherRes = await fetch(`${baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-user-sub': 'auth0|user-mangalore'
      },
      body: JSON.stringify({
        sessionId,
        message: 'How is the weather in my home city?'
      })
    });

    const weatherData = await weatherRes.json();
    assert.equal(weatherData.context.homeCity, 'London');
    const thirdPartyAction = weatherData.actions.find(a => a.type === 'THIRD_PARTY_API_CALL');
    assert.equal(thirdPartyAction.city, 'London');
  });

  test('Token Vault delegation turn is tied to user sub', async () => {
    const sessionId = 'ses_conversation_test_3';

    const calRes = await fetch(`${baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-user-sub': 'auth0|user-mangalore'
      },
      body: JSON.stringify({
        sessionId,
        message: 'Check my calendar events via Token Vault'
      })
    });

    const calData = await calRes.json();
    assert.match(calData.reply, /Google Calendar/i);
    assert.match(calData.reply, /Auth0 Token Vault/i);

    const vaultAction = calData.actions.find(a => a.type === 'AUTH0_TOKEN_VAULT_DELEGATION');
    assert.ok(vaultAction);
    assert.equal(vaultAction.userSub, 'auth0|user-mangalore');
  });

  test('User identity endpoint returns authenticated context', async () => {
    const res = await fetch(`${baseUrl}/api/identity`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.sub, 'auth0|user-mangalore');
    assert.equal(data.audience, 'https://api.assistant.local');
  });
});
