# Capabilities & consent

Extensions never touch the operating system directly. Everything they do goes
through a `nativeCall` message to the shell, which enforces policy before
executing. There are three gates, in order:

1. **Manifest declaration** — the extension declares the methods and hosts it
   uses. Undeclared calls fail with `methodNotDeclared`.
2. **User consent** — at install time the user sees every declared capability
   and accepts them. For installed extensions, the shell intersects the
   on-disk manifest with the stored consent, so a manifest can never grant
   more than the user approved. Updates that add capabilities keep them
   locked until the user re-accepts on the extension's settings page.
3. **Per-call policy** — each call is additionally checked at execution
   (e.g. `http.fetch` against the host allowlist with SSRF protections).

## Calling capabilities

The sidecar injects typed capability groups into every context and component
props:

```ts
props.capabilities.http.fetchJson<User>('https://api.example.com/me');
props.capabilities.storage.set('lastSeen', Date.now());
props.capabilities.clipboard.write('copied!');
props.capabilities.secrets.set('apiKey', '…'); // DPAPI-encrypted at rest
props.capabilities.shell.openUrl('https://…');
props.capabilities.hud.show({ title: 'Done!' });
```

Raw access (useful for methods without a typed wrapper):

```ts
props.native.call('apps.launch', { id: 'spotify' });
```

## Method reference

| Method                              | Declared as          | Notes                                                                                                                |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `http.fetch`                        | `http.fetch`         | Only allowlisted hosts; `{ auth: "provider" }` injects a managed OAuth bearer token, refreshing it as needed         |
| `storage.get/set/delete/keys`       | `storage.*` or exact | Per-extension JSON KV store, 256 keys / 256 KB                                                                       |
| `secrets.get/set/delete`            | exact                | Per-extension DPAPI-encrypted strings, 64 keys / 8 KB values                                                         |
| `shell.openUrl`                     | exact                | Absolute http(s) URLs only, opened in the user's browser                                                             |
| `clipboard.write`                   | exact                | Writes text to the clipboard                                                                                         |
| `clipboard.paste`                   | exact                | Writes text **and** pastes it into the foreground application                                                        |
| `clipboard.read/history/…`          | exact                | `clipboard.*` wildcard grants the whole namespace                                                                    |
| `apps.list` / `apps.launch`         | exact                | Installed-application search and launch                                                                              |
| `image.fetch`                       | exact                | Downloads an allowlisted image, downscales to ≤512 px, caches; returns a `file:` URI for `iconUri`/`previewImageUri` |
| `oauth.authorize/status/disconnect` | exact                | Authorization Code + PKCE in the shell; tokens never reach the extension                                             |
| `hud.show`                          | exact                | Transient HUD overlay                                                                                                |
| `media.current` / `media.control`   | exact                | System media transport                                                                                               |

## Trust model (read this)

- The sidecar is a **single shared process** for all extensions. It is not an
  isolation boundary between extensions — a malicious extension can interfere
  with others inside the sidecar. The gate is what protects the _user's_
  system, not extensions from each other.
- The consent dialog is the product: it lists exactly what the extension can
  do. Extension authors should keep declarations minimal — a package that
  only needs `storage.*` should not declare `clipboard.*`.
- On uninstall, the shell deletes the extension directory, its storage,
  secrets, OAuth tokens and cached images.

## Rendering icons

Item icons accept four variants (exactly one per item):

- **Emoji string** — `"🚀"` (rasterized by the shell's emoji renderer)
- **`{ lucide: "activity", color?: "#EF4444" }`** — a name from the shell's
  curated Lucide set, stroked in the tint color
- **`{ svg: "<svg …/>", color?: "#EC4899" }`** — arbitrary SVG markup
  rendered as a vector and tinted; ideal for icon sets an extension bundles
  itself (see the bundled lucide-icons extension)
- **`{ uri: "file:///… | data:image/png;base64,…" }`** — a cached image
  (typically from `image.fetch`) or a small data URI
