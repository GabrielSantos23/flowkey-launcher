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

| Method                              | Declared as          | Notes                                                                                                                            |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `http.fetch`                        | `http.fetch`         | Only allowlisted hosts; `{ auth: "provider" }` injects a managed OAuth bearer token, refreshing it as needed                     |
| `storage.get/set/delete/keys`       | `storage.*` or exact | Per-extension JSON KV store, 256 keys / 256 KB                                                                                   |
| `secrets.get/set/delete`            | exact                | Per-extension DPAPI-encrypted strings, 64 keys / 8 KB values                                                                     |
| `shell.openUrl`                     | exact                | Absolute http(s) URLs only, opened in the user's browser                                                                         |
| `fs.readText/writeText/glob/…`      | exact                | Scoped filesystem access, gated by manifest `fsPaths`; includes `stat`, `mkdir`, `exists`, `copy`, `move`, `trash` (Recycle Bin) |
| `clipboard.write`                   | exact                | Writes text, HTML and/or a file drop list to the clipboard                                                                       |
| `clipboard.paste`                   | exact                | Writes text **and** pastes it into the foreground application                                                                    |
| `clipboard.read/clear/…`            | exact                | `clipboard.*` wildcard grants the whole namespace; `read` returns text, HTML and file paths                                      |
| `apps.list` / `apps.launch`         | exact                | Installed-application search and launch                                                                                          |
| `apps.frontmost` / `apps.default`   | exact                | Focused application; system default handler for a path or extension                                                              |
| `system.selectedText`               | exact                | Selected text of the foreground app (UI Automation; clipboard fallback is opt-in per call)                                       |
| `image.fetch`                       | exact                | Downloads an allowlisted image, downscales to ≤512 px, caches; returns a `file:` URI for `iconUri`/`previewImageUri`             |
| `oauth.authorize/status/disconnect` | exact                | Authorization Code + PKCE in the shell; tokens never reach the extension                                                         |
| `hud.show`                          | exact                | Transient HUD overlay                                                                                                            |
| `toast.show`                        | exact                | Toast notification (title, optional message, success/failure accent, 1–10 s)                                                     |
| `alert.confirm`                     | exact                | Blocking confirmation dialog; resolves to `{ confirmed }` when the user answers                                                  |
| `cache.get/set/delete/clear`        | `cache.*` or exact   | Per-extension disposable cache with optional per-entry TTL, 512 keys / 1 MB                                                      |
| `media.current` / `media.control`   | exact                | System media transport (`playPause`, `next`, `previous`)                                                                         |

## Trust model (read this)

- The sidecar is a **single shared process** for all extensions. It is not an
  isolation boundary between extensions — a malicious extension can interfere
  with others inside the sidecar. The gate is what protects the _user's_
  system, not extensions from each other.
- The consent dialog is the product: it lists exactly what the extension can
  do. Extension authors should keep declarations minimal — a package that
  only needs `storage.*` should not declare `clipboard.*`.
- On uninstall, the shell deletes the extension directory, its storage,
  cache, secrets, OAuth tokens and cached images.

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

## Window and launch controls

Contexts and component props expose a `window` group. These are **not** native
calls — the sidecar forwards them to the shell as `windowCommand` /
`launchCommand` protocol messages, so there is nothing to declare in the
manifest:

```ts
props.window.closeMainWindow(); // hide the launcher
props.window.popToRoot(); // back to root search
props.window.clearSearchBar(); // clear the search text
props.window.launchCommand('open', 'q'); // open one of this extension's commands
```

## Rich UI-tree fields

Beyond the core list/grid/detail/form shapes, the shell renders:

- **`accessories`** on list items — trailing chips (`{ text, tooltip?, color? }`
  with `success`/`danger`/`accent`/`secondary` tints).
- **`isLoading`** and **`searchBarPlaceholder`** on `<List>`/`<Grid>` — keeps the
  loading bar active and sets the search cue text.
- **Action hints** — `style: 'destructive'` tints the action row red in the
  Ctrl+K panel; `shortcut: { key, modifiers }` is carried for display.
- **Metadata field variants** in `<Detail.Metadata>` — `kind: 'link'` with
  `href` (opens safely in the browser, like markdown links), `kind: 'tags'`
  with `tags` (chip list), and `kind: 'separator'`.
- **Pagination** on `<List>` — `pagination={{ hasNextPage, onLoadMore, pageSize }}`
  renders a Load-more row that invokes the registered handler.

## Forms

`<Form title onSubmit actions>` renders a native form view. Fields: `TextField`,
`PasswordField`, `TextArea`, `Checkbox`, `Dropdown`, `DatePicker`, `TagPicker`,
`FilePicker`, `Description`, `Separator` — all under `Form.`. The shell owns the
editing state; when any form action runs it sends the collected values as
`formValues` with the action message, and `onSubmit` (registered as the form's
submit action) receives them. Functional extensions receive the same values as
the fourth `formValues` parameter of `onAction`. Required-field validation and
file/folder pickers run in the shell.

## Manifest extras

- **Preference types** `file`, `directory` and `appPicker` render native browse
  dialogs and an application picker in Settings; checkboxes accept a `label`,
  text-like preferences a `placeholder`.
- **Command `subtitle`** shows under the command title in the root list.
- **`disabledByDefault`** starts a command disabled until the user enables it.
- **`interval`** (seconds, ≥ 60, background commands only) makes the sidecar
  re-run the command on a fixed cadence for the sidecar's lifetime.
- **Command `arguments`** (`text`, `password` or `dropdown` with `data`,
  each with a `placeholder` and optional `required`) — background commands
  capture them in the search bar (space-separated, quotes supported) and
  receive them as `ctx.arguments`. View commands receive them at open time;
  live search text stays available through the regular query.

## Deliberately not implemented

Parity items from the Raycast SDK that FlowKey intentionally does not ship:

- **AI/LLM everything** — `AI`, tools, MCP, model providers. Product decision:
  FlowKey has no AI features.
- **Process execution** (`runPowerShellScript`) — no shell route executes
  commands on the user's behalf.
- **Window management** (move/resize other apps' windows) and a **tray
  menu-bar surface** (MenuBarExtra equivalent).
- **`flowkey://` deeplinks** and **cross-extension `launchCommand`**.
- **Browser-extension APIs** (`BrowserExtension.getTabs/getContent`), and the
  macOS-only surfaces (Finder selection, QuickLook, AppleScript, MenuBarExtra).
- **`useSQL` / `useExec` / `useStreamJSON`** utilities.
- **ActionPanel.Submenu/Section and shortcut keycap rendering** — the wire
  fields exist; the action-panel UI work is still open.
- **Item `keywords`** are carried on the wire but FlowKey has no client-side
  item filter (extensions receive the query and filter themselves), so they
  currently have no effect.
