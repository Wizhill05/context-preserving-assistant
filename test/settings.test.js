import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsStore } from '../src/services/settingsStore.js';
import { createFirstPartyApiRouter } from '../src/services/firstPartyApi.js';
import { setupAuth } from '../src/services/authMiddleware.js';
import express from 'express';

describe('SettingsStore & First-Party API', () => {
  let store;

  beforeEach(() => {
    store = new SettingsStore({
      'auth0|test-user-1': {
        sub: 'auth0|test-user-1',
        name: 'Alice',
        email: 'alice@example.com',
        homeCity: 'Mangalore',
        temperatureUnit: 'celsius',
        theme: 'dark'
      }
    });
  });

  test('should retrieve stored profile by sub', () => {
    const profile = store.getProfile('auth0|test-user-1');
    assert.equal(profile.name, 'Alice');
    assert.equal(profile.homeCity, 'Mangalore');
    assert.equal(profile.temperatureUnit, 'celsius');
  });

  test('should create default profile if sub is unknown', () => {
    const profile = store.getProfile('auth0|new-random-sub');
    assert.equal(profile.sub, 'auth0|new-random-sub');
    assert.equal(profile.homeCity, 'Mangalore');
  });

  test('should update profile fields without altering sub', () => {
    const updated = store.updateProfile('auth0|test-user-1', {
      homeCity: 'San Francisco',
      temperatureUnit: 'fahrenheit',
      sub: 'hacked_sub'
    });

    assert.equal(updated.homeCity, 'San Francisco');
    assert.equal(updated.temperatureUnit, 'fahrenheit');
    assert.equal(updated.sub, 'auth0|test-user-1'); // ensure sub was not mutated
  });

  test('First-party API routes respond correctly with mock auth', async () => {
    const auth = setupAuth({ AUTH_MODE: 'mock' });
    const router = createFirstPartyApiRouter({
      authMiddleware: auth.apiAuthMiddleware,
      store
    });

    const app = express();
    app.use(express.json());
    app.use('/api', router);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      // 1. GET /api/settings
      const getRes = await fetch(`http://127.0.0.1:${port}/api/settings`, {
        headers: {
          'Authorization': 'Bearer mock_jwt_token_for_auth0|test-user-1'
        }
      });
      assert.equal(getRes.status, 200);
      const getJson = await getRes.json();
      assert.equal(getJson.success, true);
      assert.equal(getJson.data.sub, 'auth0|test-user-1');
      assert.equal(getJson.data.homeCity, 'Mangalore');

      // 2. PUT /api/settings
      const putRes = await fetch(`http://127.0.0.1:${port}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_jwt_token_for_auth0|test-user-1'
        },
        body: JSON.stringify({ homeCity: 'Tokyo', temperatureUnit: 'celsius' })
      });
      assert.equal(putRes.status, 200);
      const putJson = await putRes.json();
      assert.equal(putJson.success, true);
      assert.equal(putJson.data.homeCity, 'Tokyo');

      // Verify store updated
      assert.equal(store.getProfile('auth0|test-user-1').homeCity, 'Tokyo');
    } finally {
      server.close();
    }
  });
});
