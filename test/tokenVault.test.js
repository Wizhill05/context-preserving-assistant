import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TokenVaultAdapter } from '../src/services/tokenVault.js';

describe('Auth0 Token Vault Pluggable Adapter', () => {
  test('throws when userId is omitted', async () => {
    const vault = new TokenVaultAdapter();
    await assert.rejects(
      async () => {
        await vault.getProviderToken({ provider: 'google-calendar' });
      },
      /User identity/
    );
  });

  test('retrieves mock delegated token in mock mode', async () => {
    const vault = new TokenVaultAdapter({ enabled: false });
    const res = await vault.getProviderToken({
      userId: 'auth0|user-test-789',
      provider: 'google-calendar',
      scopes: ['calendar.readonly']
    });

    assert.equal(res.provider, 'google-calendar');
    assert.ok(res.token);
    assert.match(res.source, /Token Vault/);
  });

  test('mockCallGoogleCalendar produces scoped calendar events tied to user sub', async () => {
    const vault = new TokenVaultAdapter({ enabled: false });
    const cal = await vault.mockCallGoogleCalendar({
      userId: 'auth0|user-test-789',
      userAccessToken: 'mock_jwt_token'
    });

    assert.equal(cal.success, true);
    assert.equal(cal.delegatedUser, 'auth0|user-test-789');
    assert.ok(Array.isArray(cal.events));
    assert.ok(cal.events.length >= 2);
  });
});
