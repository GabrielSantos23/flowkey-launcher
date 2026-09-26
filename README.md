# FlowKey

**A fast, native Windows launcher with TypeScript + React extensions.**

FlowKey is a WPF (.NET 8) launcher summoned by a global hotkey: search and
launch installed apps, crunch numbers, drive your clipboard, control Spotify,
search 1600+ icons, and act on everything with a `Ctrl+K` action panel — all
keyboard-first, all rendered natively. Extensions are written in TypeScript +
React, run in a Bun sidecar process, and serialize into a native UI tree:
**no web view, no Electron, no DOM**.

## How it works

```
┌──────────────────────────────────┐
│  FlowKey.Shell (WPF, C# / .NET 8)│  window, tray, global hotkeys, and every
│  - renders the serialized UI     │  privileged service: clipboard, app
│    tree natively                 │  indexing, network policy, OAuth + PKCE,
│  - gates every extension call    │  DPAPI secrets, media transport, storage
└──────────┬───────────────────────┘
           │ NDJSON over stdio — versioned protocol, pinned by
           │ contract fixtures tested on BOTH sides
┌──────────▼───────────────────────┐
│  FlowKey.Sidecar (Bun, TS)       │  loads extensions (first-party bundled,
│  - runs extension React via a    │  third-party dynamically from disk),
│    custom reconciler             │  serializes UI trees, serves searches
└──────────────────────────────────┘
```

Extensions never touch the OS directly. Every capability call — network,
clipboard, storage, secrets, apps, media — goes through a gated native route
in the shell, checked against the extension's manifest **and** the
capabilities the user accepted at install time.

## What it does

### Launcher core

- **Summon anywhere** — a global hotkey (default `Ctrl+Alt+Space`,
  re-bindable), auto-hide on focus loss, tray icon, single instance.
- **App search & launch** — Start Menu enumeration with usage-ranked results
  and favorites.
- **Command search** — every extension command is searchable by title and
  keywords from the root, with per-command hotkeys.
- **Calculator** — instant evaluation with unit conversions, date math, and
  currency rates, right in the search bar.
- **Clipboard history** — text, files and images with search, per-entry
  actions (copy, paste, edit) and paste-to-foreground.
- **Action panel** — `Ctrl+K` opens every action available on the selected
  result; Enter runs the primary one.
- **HUD + toasts** — transient overlays for extension feedback.
- **Settings app** — general, per-command shortcuts, one page per extension
  (preferences, OAuth accounts, hotkeys), and updates.
- **Auto-updates** — Velopack against GitHub Releases; installers and a
  portable zip ship with every release.

### Bundled extensions

| Extension             | What it does                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apps**              | Search and launch installed applications                                                                                                                       |
| **Emoji & Symbols**   | Emoji, symbol and kaomoji picker with categories and keyword search                                                                                            |
| **Clipboard History** | Browse, copy, paste and edit recent clipboard text                                                                                                             |
| **Google Translate**  | Translate text as you type, quick-translate, and translate from the clipboard                                                                                  |
| **Spotify**           | Search, browse your library, now playing, queue, devices, full playback control and lyrics — with OAuth + PKCE handled by the shell (bring your own client id) |
| **Lucide Icons**      | Search 1636 Lucide icons in a tintable grid; copy name/SVG/component or open on lucide.dev (offline — icons bundled)                                           |

### Third-party extensions

Install community extensions from **Settings → Extensions → Install from
file…**. A `.flowkey` package is a zip containing `manifest.json` plus a
bundled `main.js` — no compilation happens on the user's machine.

- **Consent first** — the dialog lists every declared capability: native
  methods, network hosts, OAuth providers. Nothing runs before you accept.
- **Enforced forever** — the shell stores what you accepted and intersects it
  with the manifest on every call; an update that adds capabilities keeps
  them locked until you re-accept.
- **Network policy** — `http.fetch` only reaches hosts declared in the
  manifest, with SSRF protections (private-IP blocking, credential
  rejection, redirect checks). OAuth tokens live DPAPI-encrypted in the
  shell and are never exposed to extensions.
- **Clean removal** — uninstall deletes the extension plus its storage,
  secrets, tokens and cached images.
- **Per-extension data** — isolated JSON key-value storage, DPAPI-encrypted
  secrets, and a schema-validated preferences surface in Settings.

## The extension SDK

Extensions are ordinary npm projects. Scaffold one without ever cloning this
repository:

```bash
npx @flowkey-cli/cli init "My Extension"
cd my-extension && pnpm install
pnpm dev        # build + install into FlowKey + rebuild on change
pnpm package    # produce the .flowkey zip to share
```

Three packages, published on npm:

| Package                                                                            | What it gives you                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@flowkey-cli/cli`](https://www.npmjs.com/package/@flowkey-cli/cli)               | `init` (scaffold), `dev` (watch loop), `build`, `validate` (manifest lint), `package` (`.flowkey` zip) — plus the host shims and project template |
| [`@flowkey-cli/native-sdk`](https://www.npmjs.com/package/@flowkey-cli/native-sdk) | Wire/protocol types, the manifest validator (same rules the shell enforces), typed capability helpers                                             |
| [`@flowkey-cli/react-ui`](https://www.npmjs.com/package/@flowkey-cli/react-ui)     | `<List>` / `<Grid>` / `<Detail>`, `<ActionPanel>` / `<Action>`, tinted emoji/lucide/SVG/image icons, sections and filter dropdowns                |

Inside a view, everything arrives as props:

```tsx
import {
  List,
  Action,
  ActionPanel,
  defineReactExtension,
  type CommandProps,
} from '@flowkey-cli/react-ui';
import manifest from '../manifest.json';

function MyView(props: CommandProps) {
  return (
    <List>
      <List.Item
        id="example"
        title={props.query || 'Type something'}
        actions={
          <ActionPanel>
            <Action
              title="Save"
              onAction={async () => {
                await props.capabilities.storage.set('last', props.query);
                await props.capabilities.hud.show({ title: 'Saved!' });
              }}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}

export default defineReactExtension({ manifest, component: MyView });
```

Capabilities cover HTTP with OAuth token injection (`http.fetchJson`,
`{ auth: "provider" }`), key-value storage, DPAPI secrets, clipboard
write/read/paste, app launching, image fetching/caching, media transport,
HUD, and OAuth — each declared in the manifest and consented by the user.

Full documentation: [extension quickstart](flowkey-native/docs/extension-quickstart.md) ·
[package format & manifest reference](flowkey-native/docs/extension-format.md) ·
[capabilities & consent](flowkey-native/docs/extension-capabilities.md).

## Releases

Two independent release lines, both from GitHub Actions:

- **`shell-v*` tags** → installer + portable zip + update feed (Velopack).
  Latest: [releases/latest](https://github.com/GabrielSantos23/flowkey-launcher/releases/latest).
- **`flowkey-sdk-v*` tags** → the npm packages above, published in dependency
  order after the TypeScript suites pass.

## Development

Prerequisites: [.NET 8 SDK](https://dotnet.microsoft.com), [Bun](https://bun.sh),
pnpm 10, Node 20+.

```bash
cd flowkey-native
pnpm install
pnpm test       # every typecheck (TS + C#) → bun suites → dotnet tests
```

Run the shell by opening `flowkey-native/shell/FlowKey.sln` in Visual Studio,
or `dotnet run` on `flowkey-native/shell/src/Shell/Shell.csproj`. The debug
build spawns the sidecar under Bun from the repo tree.

### Project layout

```
flowkey-native/
├── contract/    # wire contracts (protocol, UI tree, manifest) — tested by bun AND xunit
├── sdk/         # @flowkey-cli/native-sdk
├── react-ui/    # @flowkey-cli/react-ui (custom React reconciler → UI tree)
├── cli/         # @flowkey-cli/cli + host shims + scaffold template
├── sidecar/     # the Bun extension host
├── extensions/  # first-party extensions (emoji, apps, clipboard, translate, spotify, lucide-icons…)
├── shell/       # the WPF shell (FlowKey.sln) + xunit suite
├── docs/        # extension developer documentation
└── scripts/     # generators (icon metadata)
```

The layers are strict: the shell renders and gates, the sidecar computes and
serializes, and the `contract/` fixtures are the law between them — a protocol
change without matching assertions on both sides fails CI by design.

## License

See [LICENSE](LICENSE).
