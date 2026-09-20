import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as commands from '../../lib/ipc/commands';
import type { OAuthTokenPayload } from '../../lib/ipc/commands';
import { logService } from '../../services/log/logService';
import { extensionPreferencesService } from '../../services/extension/extensionPreferencesService';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-top-read',
];

const EXTENSION_ID = 'spotify';
const PROVIDER_ID = 'spotify';
/** Same 60-second safety buffer the Rust oauth layer uses. */
const EXPIRY_BUFFER_SECS = 60;
const AUTHORIZE_TIMEOUT_MS = 5 * 60 * 1000;

export interface SpotifyToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scopes: string[];
  /** Unix timestamp seconds. Undefined = no expiry. */
  expiresAt?: number;
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

export function isTokenUsable(token: SpotifyToken | null, nowSecs: number): boolean {
  if (!token) return false;
  if (token.expiresAt === undefined) return true;
  return nowSecs <= token.expiresAt - EXPIRY_BUFFER_SECS;
}

export function shouldRefresh(token: SpotifyToken | null, nowSecs: number): boolean {
  if (!token || isTokenUsable(token, nowSecs)) return false;
  return !!token.refreshToken;
}

export function parseCallbackUrl(
  url: string,
): { code: string; state: string } | { error: string; state: string } | null {
  if (!url.startsWith('asyar://oauth/callback')) return null;
  const parsed = new URL(url);
  const state = parsed.searchParams.get('state');
  if (!state) return null;
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error');
  if (error) return { error, state };
  if (!code) return null;
  return { code, state };
}

// ── Service ───────────────────────────────────────────────────────────────────

class SpotifyAuth {
  private token: SpotifyToken | null = null;
  private hydrated = false;
  private clientId: string | null = null;
  private unlisten: UnlistenFn | null = null;
  private authorizeWaiter: {
    resolve: (token: SpotifyToken) => void;
    reject: (err: Error) => void;
  } | null = null;

  /** The Client ID comes from the feature preference (Settings → Extensions → Spotify). */
  setClientId(clientId: string | null | undefined): void {
    this.clientId = clientId?.trim() || null;
  }

  /**
   * Re-read the Client ID from the live preference store. The preference can
   * be saved AFTER this session started, so it must never be read only once
   * at initialize().
   */
  async refreshClientId(): Promise<void> {
    try {
      const bundle = await extensionPreferencesService.getEffectivePreferences(EXTENSION_ID);
      const value = (bundle.extension as Record<string, unknown> | undefined)?.clientId;
      this.setClientId(typeof value === 'string' ? value : null);
    } catch (err) {
      logService.warn(`[Spotify] failed to read clientId preference: ${err}`);
    }
  }

  hasClientId(): boolean {
    return this.clientId !== null;
  }

  /**
   * Load the persisted token once per session. Uses the refreshable variant
   * so an expired-but-refreshable token survives app restarts — getValidToken
   * refreshes it instead of forcing a full re-login.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    const stored = await commands.oauthGetStoredTokenRefreshable(EXTENSION_ID, PROVIDER_ID);
    if (stored) this.token = stored;
  }

  /**
   * Return a usable access token: hydrate → reuse → refresh → null.
   * `null` means the user must (re-)authorize.
   */
  async getValidToken(): Promise<string | null> {
    await this.hydrate();
    const now = Math.floor(Date.now() / 1000);

    if (isTokenUsable(this.token, now)) {
      return this.token!.accessToken;
    }

    if (shouldRefresh(this.token, now)) {
      const refreshed = await commands.oauthRefreshToken({
        extensionId: EXTENSION_ID,
        providerId: PROVIDER_ID,
        clientId: this.clientId ?? '',
        tokenUrl: SPOTIFY_TOKEN_URL,
      });
      if (refreshed) {
        this.token = refreshed;
        logService.debug('[Spotify] access token refreshed');
        return refreshed.accessToken;
      }
      // Refresh rejected (revoked/invalid_grant) — the stored token is
      // worthless; drop it so the next authorize starts clean.
      this.token = null;
      await commands.oauthRevokeExtensionToken(EXTENSION_ID, PROVIDER_ID);
      logService.warn('[Spotify] stored token was rejected — re-authorization required');
      return null;
    }

    this.token = null;
    return null;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /**
   * Run the PKCE authorize flow: start it in Rust, open Spotify in the
   * browser, and wait for the `asyar://oauth/callback` deep link.
   */
  async authorize(): Promise<SpotifyToken> {
    if (!this.clientId) {
      throw new Error('Spotify Client ID is not configured');
    }

    this.ensureListener();
    const flowId = `spotify-${Date.now()}`;
    const start = await commands.oauthStartFlow(
      EXTENSION_ID,
      PROVIDER_ID,
      this.clientId,
      SPOTIFY_AUTH_URL,
      SPOTIFY_TOKEN_URL,
      SPOTIFY_SCOPES,
      flowId,
    );
    if (!start) throw new Error('Failed to start the Spotify authorization flow');

    const done = new Promise<SpotifyToken>((resolve, reject) => {
      this.authorizeWaiter = { resolve, reject };
      setTimeout(() => {
        if (this.authorizeWaiter) {
          this.authorizeWaiter = null;
          reject(new Error('Spotify authorization timed out'));
        }
      }, AUTHORIZE_TIMEOUT_MS);
    });

    await openUrl(start.authUrl);
    return done;
  }

  async logout(): Promise<void> {
    this.token = null;
    await commands.oauthRevokeExtensionToken(EXTENSION_ID, PROVIDER_ID);
  }

  /** @internal test-only reset of all in-memory auth state. */
  __reset(): void {
    this.token = null;
    this.hydrated = false;
    this.clientId = null;
    this.authorizeWaiter = null;
  }

  private ensureListener(): void {
    if (this.unlisten) return;
    void listen<string>('asyar:deep-link', (event) => {
      this.handleDeepLink(event.payload);
    }).then((fn) => {
      this.unlisten = fn;
    });
  }

  /** Route an incoming deep link; public so pending cold-start links can be replayed. */
  handleDeepLink(url: string): void {
    const parsed = parseCallbackUrl(url);
    if (!parsed) return;

    const waiter = this.authorizeWaiter;
    if (!waiter) return;
    this.authorizeWaiter = null;

    if ('error' in parsed) {
      waiter.reject(new Error(`Spotify authorization failed: ${parsed.error}`));
      return;
    }

    void commands
      .oauthExchangeCode(parsed.state, parsed.code)
      .then((result) => {
        if (!result) throw new Error('Spotify token exchange failed');
        this.token = result.token;
        waiter.resolve(result.token);
      })
      .catch((err) => waiter.reject(err instanceof Error ? err : new Error(String(err))));
  }
}

export const spotifyAuth = new SpotifyAuth();

/** Test hook: wipe all in-memory auth state (tokens, hydration flags). */
export function resetSpotifyAuthForTests(): void {
  // Access the instance's private state through a controlled reassignment.
  const anyAuth = spotifyAuth as unknown as { __reset(): void };
  anyAuth.__reset();
}
export type { OAuthTokenPayload };
