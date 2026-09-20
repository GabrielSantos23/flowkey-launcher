## Goal

Port the Raycast `spotify-player` extension into a native Tier 1 built-in feature (`src/built-in-features/spotify/`, same architecture as clipboard-history), Core-v1 scope, controlled via the Spotify Web API (playback control requires Spotify Premium — a Spotify limitation).

## Reuse from Asyar (no new infra needed)

- **OAuth**: existing generic PKCE machinery (`extensionOAuthService` + Rust `oauth/` module: deep-link redirect `asyar://spotify-callback`, server-side token exchange, encrypted SQLite token store keyed by `spotify:spotify`).
- **Deep links**: raw in-scheme URLs already emit `asyar:deep-link` — the callback listener is frontend-only.
- **Network**: direct fetch with Bearer token (CSP already allows `connect-src https://*`).

## Rust additions (TDD — failing tests first)

1. `oauth_refresh_token` command + service fn in `oauth/service.rs`: refresh-grant POST to `https://accounts.spotify.com/api/token` using the stored refresh token; updates the encrypted row. Unit tests following existing oauth test patterns.
2. `oauth_get_stored_token` command: returns the stored token for `{extensionId, providerId}` (or null) so the built-in hydrates on startup.

## Frontend — `src/built-in-features/spotify/`

- **`manifest.json`**: view commands — Now Playing (trigger `spotify`), Search, Library, Queue, Devices, Lyrics; background quick commands — toggle-play-pause, next-track, previous-track, like-current-track, toggle-shuffle, cycle-repeat, copy-track-url. Preference: `clientId` (required) — you paste your Spotify app Client ID in Settings → Extensions → Spotify.
- **`spotifyAuth.ts`**: token hydration (`oauth_get_stored_token`), expiry-aware `getAccessToken()` with auto-refresh, `authorize()` (opens Spotify auth page via PKCE flow; listens on `asyar:deep-link` for `spotify-callback`), `logout()`.
- **`spotifyApi.ts`**: typed client for the endpoints v1 needs (player state, play/pause/next/prev, like/unlike, top items, search, playlists + playlist tracks, queue, devices, transfer, recommendations) with 429 `Retry-After` handling (port of `rateLimitRetry.ts`).
- **`helpers/cleanupSongTitle.ts`**: port for lyrics matching.
- **`state.ts`**: Signal store (playback state, current track, devices, queue) in the clipboard `state.ts` pattern.
- **Views** (design-system components; logic in tested `.ts` files): `DefaultView.tsx` (Now Playing: track info, play/pause, like, next/prev, radio via recommendations, add-to-playlist, device transfer), `SearchView.tsx`, `LibraryView.tsx`, `QueueView.tsx`, `DevicesView.tsx`, `LyricsView.tsx` (LRCLIB free API, no auth).
- **Setup UX**: when no Client ID or no token, views show a setup card (create Spotify app → add redirect URIs `asyar://spotify-callback` + `asyar-dev://spotify-callback` → paste Client ID → Authorize).
- **`index.ts`**: Extension class wiring services, command routing, core action registration; manifest walkthrough entry; i18n strings.

**Deliberately out of scope (follow-ups)**: AI playlist generator/DJ (needs an AI provider), menu-bar widget (could use statusBarService later), AppleScript/macOS + Windows SMTC local control (Web API only for v1), recent-searches persistence.

## TDD order (per tdd skill)

1. `spotifyApi.test.ts` — URL building, Bearer header, 429 Retry-After wait-and-retry, error mapping (failing test first, mocked fetch).
2. `spotifyAuth.test.ts` — expiry math, refresh decision, callback URL parsing (code/state/error), mocked IPC + events.
3. `cleanupSongTitle.test.ts` — ported cases.
4. Rust oauth refresh tests before implementation.
5. Views last; logic kept in tested `.ts` modules.

## Verification

`cargo fmt/clippy/test` (new oauth tests), full `pnpm test:run`, `pnpm check:design`, prettier on touched files, `tsc` error count not increased. Manual QA needs your Spotify app Client ID + the two redirect URIs registered in the Spotify dashboard.