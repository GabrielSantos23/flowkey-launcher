# flowkey-native

Native C# / .NET 8 WPF shell for FlowKey with TypeScript extensions running in
a bun sidecar process. This folder is **outside** the root pnpm workspace
(`pnpm-workspace.yaml` globs do not match it) and is fully independent of the
existing Tauri app, Rust host and `asyar-sdk`.

## Layout

- `contract/` — canonical JSON fixtures (UI tree + protocol + manifest
  validation). The single source of truth: the bun test in `sdk/` and the
  xunit test in `shell/tests/` both validate their models against these exact
  bytes, so contract drift fails both sides.
- `sdk/` — `@flowkey-cli/native-sdk`, the TypeScript SDK for the new extension
  model (UI-tree types, protocol messages, manifest validation, typed
  capabilities, `defineExtension`).
- `cli/` — `@flowkey-cli/cli`, the `flowkey` command (`init`, `dev`, `build`,
  `validate`, `package`) for creating, running and sharing extensions.
- `sidecar/` — the sidecar process: loads first-party extensions statically
  and installed third-party extensions dynamically from disk, speaks NDJSON
  over stdin/stdout with the shell.
- `extensions/` — new-model extensions (first: `emoji`).
- `docs/` — extension developer documentation (quickstart, package format,
  capabilities & consent).
- `shell/` — the WPF shell (`FlowKey.sln`, `FlowKey.Shell` + xunit tests).

## Commands

Run from this folder (or via `pnpm --dir flowkey-native <script>` from the
repo root):

| script              | what it does                         |
| ------------------- | ------------------------------------ |
| `sdk:test`          | bun test for the SDK contract        |
| `sdk:typecheck`     | TypeScript check for `sdk/`          |
| `cli:test`          | bun test for `@flowkey-cli/cli`      |
| `cli:typecheck`     | TypeScript check for `cli/`          |
| `cli:build`         | bundle the `flowkey` CLI             |
| `sidecar:typecheck` | TypeScript check for `sidecar/`      |
| `shell:build`       | `dotnet build` (Release)             |
| `shell:test`        | `dotnet test` (xunit contract tests) |
| `test`              | all typechecks + all test suites     |

## Development flags

- `FlowKey.Shell.exe --settings` — launches straight into the settings window
  (4s delayed so automation can attach first). Used by the `screenshot-*.ps1`
  and `measure-settings.ps1` helper scripts in `shell/`; not part of the
  end-user surface.

## Protocol (v1)

Newline-delimited JSON, one object per line, over the sidecar's stdin/stdout.
See `contract/protocol.fixture.json` for exact shapes.

- Host → sidecar: `init` (carries `protocolVersion`, `extensionsDir`,
  `preferences`), `search`, `action`, `preferences`.
- Sidecar → host: `ready` (carries `protocolVersion` + per-extension
  `nativeMethods` / `httpHosts` declarations), `ui`, `uiPush`, `error`,
  `nativeCall`, `nativeResult`, `log`.
- The shell refuses to run against a sidecar whose `protocolVersion` differs
  from its own; the mismatch is reported as an error, never a silent failure.

### UI push

`uiPush` is the one shell-uninitiated message: an extension view that re-renders
on its own (timer, async fetch resolving) sends the new tree without a
`requestId` to correlate against. The shell applies a `uiPush` only when the
pushed `extensionId`/`commandId`/`query`/`filterValue` match the command view it
is currently displaying; anything else is discarded, the same discipline as
stale `requestId`s. Request-correlated `ui` responses are never throttled or
skipped — every `search`/`action` request still gets exactly one `ui`/`error`.

### Native calls

Every `nativeCall` carries the calling `extensionId`. The shell enforces the
per-extension manifest declarations (`nativeMethods`, `httpHosts` declared in
the manifest from Phase 0; enforcement lands in Phase 2). Requests are
correlated by `requestId` in both directions.

**Isolation note:** the sidecar is a single shared process running all
extensions. It is NOT an isolation boundary between extensions — a malicious
or buggy extension can interfere with others inside the sidecar. This is a
conscious decision for now: the shell treats the sidecar as a whole and
attributes native calls to extensions for policy and auditing, not for
in-process isolation.

**Preferences note:** preference values are sliced per extension by the
shell, but every slice travels through the same shared sidecar process, so
preferences are NOT a security boundary between extensions either — the same
caveat as the isolation note below applies.

**Consent note:** declaring a native method or an httpHost in a manifest is
NOT user consent on its own. Third-party extension installation now exists
(Settings → Extensions → Install from file…), and it requires a consent
dialog listing every declared capability before the package is extracted.
The accepted capability set is stored per extension and enforced per native
call for the extension's lifetime — a manifest can never grant more than the
user accepted, and an update that adds capabilities keeps them locked until
the user reviews them. See `docs/extension-capabilities.md`.

## Third-party extensions

Installed extensions are `.flowkey` packages (zips containing `manifest.json`
plus a bundled `main.js`) placed in
`%LOCALAPPDATA%\FlowKey.Shell\extensions\<id>\`. The sidecar discovers and
dynamically imports them on every `init`; a broken extension is reported in
the `ready.failures` list and never prevents the others from loading.

Extension authors use `@flowkey-cli/cli`:

```bash
pnpm dlx @flowkey-cli/cli init "My Extension"
cd my-extension && pnpm install
pnpm dev        # build + install into FlowKey + watch
pnpm package    # produce the .flowkey zip
```

Bundles alias `react`, `@flowkey-cli/react-ui` and `@flowkey-cli/native-sdk` to shims
over `globalThis.__FLOWKEY_HOST__` (installed by the sidecar before the
bundle is imported), so hooks and UI serialization always share the host's
single module instances. See `docs/extension-quickstart.md` for the full
tutorial and `docs/extension-format.md` for the package spec.

## Bun requirement

The sidecar requires [bun](https://bun.sh) on PATH. If the shell cannot find
bun it shows a clear error toast; it never crashes.

## Manifest

Extensions declare their capabilities up front in `manifest.json`
(`nativeMethods`, `httpHosts`, `oauth`), pinned in
`contract/protocol.fixture.json`.

## Native services for authenticated extensions

- **`oauth.authorize` / `oauth.status` / `oauth.disconnect`** — Authorization
  Code + PKCE flows executed entirely in the C# shell. The shell generates the
  `code_verifier`/`code_challenge`, opens the system browser, listens on
  `http://127.0.0.1:<port>/callback`, and validates the `state` parameter
  (CSRF protection). Tokens are stored DPAPI-encrypted in
  `%LOCALAPPDATA%\FlowKey.Shell\token-vault.json` keyed by
  `(extensionId, provider)` and are **never sent to the sidecar or the
  extension**; extensions only see `{ok, expiresAt, scope}`.
- **`http.fetch` with `auth: "<provider>"`** — the shell injects
  `Authorization: Bearer …` for requests to the provider's pinned host
  (`api.spotify.com` for Spotify), refreshes expired tokens, retries once on
  401, honors short `Retry-After` on 429, and fails with the structured error
  `authRequired` when re-authorization is needed.
- **`secrets.get` / `secrets.set` / `secrets.delete`** — per-extension
  key/value store with DPAPI-encrypted values in
  `%LOCALAPPDATA%\FlowKey.Shell\secrets.json`. Values are capped at 8 KB and
  64 keys per extension. This is not an isolation boundary: all extensions
  share one sidecar process.
- **`image.fetch`** — downloads an image from an `httpHosts`-allowlisted URL,
  downscales it to at most 512 px, re-encodes PNG, and caches it under
  `%LOCALAPPDATA%\FlowKey.Shell\icon-cache\images\<extensionId>\`. The result
  is a `file:` URI usable directly as an item `iconUri` or pane
  `previewImageUri`.

## Bring your own Spotify app

The Spotify OAuth client id is deliberately **not** in the repository. Create
your own app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
and provide the client id via either:

1. the `FLOWKEY_SPOTIFY_CLIENT_ID` environment variable (takes precedence), or
2. `%LOCALAPPDATA%\FlowKey.Shell\spotify-auth.json`:

```json
{ "clientId": "your-client-id", "redirectPort": 0 }
```

3. the extension's own preference: open FlowKey Settings, find the Spotify
   section, and paste the client id into the "Spotify client id" field. It is
   stored DPAPI-encrypted like any password preference and is passed to the
   shell with the `oauth.authorize` call; the environment variable and config
   file above still take precedence.

Register `http://127.0.0.1/callback` (loopback IP literal **without a port**)
as the app's redirect URI — per the Spotify docs, the dynamically assigned
port may then be added at authorization time. If you prefer to pin a fixed
port instead, register `http://127.0.0.1:<port>/callback` and set
`redirectPort` in the config above.

Note Spotify's current developer-mode limits: the app owner must have Spotify
Premium, at most 5 allowlisted users can authenticate, and playback control
requires a Premium account.
