import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  isTokenUsable,
  shouldRefresh,
  parseCallbackUrl,
  SPOTIFY_SCOPES,
  SPOTIFY_AUTH_URL,
  SPOTIFY_TOKEN_URL,
} from './spotifyAuth';

describe('isTokenUsable', () => {
  it('returns false for null (no token stored)', () => {
    expect(isTokenUsable(null, 1000)).toBe(false);
  });

  it('returns true when the token has no expiry', () => {
    expect(isTokenUsable({ accessToken: 'a', tokenType: 'Bearer', scopes: [] }, 1000)).toBe(true);
  });

  it('returns false when expired', () => {
    expect(
      isTokenUsable({ accessToken: 'a', tokenType: 'Bearer', scopes: [], expiresAt: 900 }, 1000),
    ).toBe(false);
  });

  it('returns false within the 60-second refresh buffer', () => {
    expect(
      isTokenUsable({ accessToken: 'a', tokenType: 'Bearer', scopes: [], expiresAt: 1040 }, 1000),
    ).toBe(false);
  });

  it('returns true when comfortably valid', () => {
    expect(
      isTokenUsable({ accessToken: 'a', tokenType: 'Bearer', scopes: [], expiresAt: 2000 }, 1000),
    ).toBe(true);
  });
});

describe('shouldRefresh', () => {
  it('returns false when the token is usable', () => {
    expect(
      shouldRefresh({ accessToken: 'a', tokenType: 'Bearer', scopes: [], expiresAt: 2000 }, 1000),
    ).toBe(false);
  });

  it('returns true when expired and a refresh token exists', () => {
    expect(
      shouldRefresh(
        { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', scopes: [], expiresAt: 900 },
        1000,
      ),
    ).toBe(true);
  });

  it('returns false when expired but no refresh token exists (re-auth required)', () => {
    expect(
      shouldRefresh({ accessToken: 'a', tokenType: 'Bearer', scopes: [], expiresAt: 900 }, 1000),
    ).toBe(false);
  });
});

describe('parseCallbackUrl', () => {
  it('extracts code and state from a success callback', () => {
    const result = parseCallbackUrl('asyar://oauth/callback?code=abc123&state=st1');
    expect(result).toEqual({ code: 'abc123', state: 'st1' });
  });

  it('extracts an error from a denied callback', () => {
    const result = parseCallbackUrl('asyar://oauth/callback?error=access_denied&state=st1');
    expect(result).toEqual({ error: 'access_denied', state: 'st1' });
  });

  it('returns null for a non-oauth deep link', () => {
    expect(parseCallbackUrl('asyar://auth/callback?code=abc')).toBeNull();
    expect(parseCallbackUrl('https://example.com/whatever')).toBeNull();
  });
});

describe('constants', () => {
  it('targets the Spotify endpoints and the playback scopes v1 needs', () => {
    expect(SPOTIFY_AUTH_URL).toBe('https://accounts.spotify.com/authorize');
    expect(SPOTIFY_TOKEN_URL).toBe('https://accounts.spotify.com/api/token');
    expect(SPOTIFY_SCOPES).toContain('user-read-playback-state');
    expect(SPOTIFY_SCOPES).toContain('user-modify-playback-state');
    expect(SPOTIFY_SCOPES).toContain('playlist-read-private');
    expect(SPOTIFY_SCOPES).toContain('playlist-modify-public');
    expect(SPOTIFY_SCOPES).toContain('user-library-read');
    expect(SPOTIFY_SCOPES).toContain('user-library-modify');
    expect(SPOTIFY_SCOPES).toContain('user-top-read');
    expect(SPOTIFY_SCOPES).toContain('user-read-email');
  });
});

// ── hydration / refresh-across-restart ────────────────────────────────────────

const oauthMocks = vi.hoisted(() => ({
  oauthGetStoredTokenRefreshable: vi.fn(),
  oauthRefreshToken: vi.fn(),
  oauthRevokeExtensionToken: vi.fn().mockResolvedValue(undefined),
  oauthExchangeCode: vi.fn(),
  oauthStartFlow: vi.fn(),
  oauthGetStoredToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/ipc/commands', () => ({
  oauthGetStoredToken: oauthMocks.oauthGetStoredToken,
  oauthGetStoredTokenRefreshable: oauthMocks.oauthGetStoredTokenRefreshable,
  oauthRefreshToken: oauthMocks.oauthRefreshToken,
  oauthRevokeExtensionToken: oauthMocks.oauthRevokeExtensionToken,
  oauthExchangeCode: oauthMocks.oauthExchangeCode,
  oauthStartFlow: oauthMocks.oauthStartFlow,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../services/extension/extensionPreferencesService', () => ({
  extensionPreferencesService: {
    getEffectivePreferences: vi.fn().mockResolvedValue({ extension: {}, commands: {} }),
  },
}));

import { resetSpotifyAuthForTests, spotifyAuth } from './spotifyAuth';

describe('token persistence across restarts', () => {
  beforeEach(() => {
    resetSpotifyAuthForTests();
    vi.clearAllMocks();
    // clearAllMocks keeps mockResolvedValue implementations — reset the ones
    // that carry state between tests and set neutral defaults.
    oauthMocks.oauthGetStoredTokenRefreshable.mockReset().mockResolvedValue(null);
    oauthMocks.oauthRefreshToken.mockReset();
    oauthMocks.oauthGetStoredToken.mockResolvedValue(null);
  });

  it('refreshes an expired stored token on startup instead of forcing re-login', async () => {
    oauthMocks.oauthGetStoredTokenRefreshable.mockResolvedValue({
      accessToken: 'stale',
      refreshToken: 'ref-1',
      tokenType: 'Bearer',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) - 100,
    });
    oauthMocks.oauthRefreshToken.mockResolvedValue({
      accessToken: 'fresh',
      refreshToken: 'ref-2',
      tokenType: 'Bearer',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const token = await spotifyAuth.getValidToken();

    expect(oauthMocks.oauthGetStoredTokenRefreshable).toHaveBeenCalledWith('spotify', 'spotify');
    expect(oauthMocks.oauthRefreshToken).toHaveBeenCalled();
    expect(token).toBe('fresh');
  });

  it('clears the stored token when refresh is rejected (invalid_grant)', async () => {
    oauthMocks.oauthGetStoredTokenRefreshable.mockResolvedValue({
      accessToken: 'stale',
      refreshToken: 'revoked',
      tokenType: 'Bearer',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) - 100,
    });
    oauthMocks.oauthRefreshToken.mockResolvedValue(null);

    const token = await spotifyAuth.getValidToken();

    expect(token).toBeNull();
    expect(oauthMocks.oauthRevokeExtensionToken).toHaveBeenCalledWith('spotify', 'spotify');
  });

  it('returns null without calling anything when nothing is stored', async () => {
    oauthMocks.oauthGetStoredTokenRefreshable.mockResolvedValue(null);

    const token = await spotifyAuth.getValidToken();

    expect(token).toBeNull();
    expect(oauthMocks.oauthRefreshToken).not.toHaveBeenCalled();
  });
});
