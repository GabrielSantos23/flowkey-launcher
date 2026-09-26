# FlowKey

**A fast, native Windows launcher with TypeScript extensions.**

FlowKey is a WPF (.NET 8) launcher summoned by a global hotkey: search and
launch installed apps, run extension commands, and act on results — all
keyboard-first. Extensions are written in TypeScript + React, run in a Bun
sidecar process, and render into a native UI tree (no web view, no Electron).

## How it works

```
┌─────────────────────────────┐
│  FlowKey.Shell (WPF, C#)    │  window, tray, hotkeys, native services
│  - renders the UI tree      │  (clipboard, apps, http policy, OAuth,
│  - gates every native call  │   secrets, media, HUD, storage)
└──────────┬──────────────────┘
           │ NDJSON over stdio (versioned protocol, contract-tested)
┌──────────▼──────────────────┐
│  FlowKey.Sidecar (Bun, TS)  │  loads extensions, runs React via a
│  - first-party: bundled     │  custom reconciler that serializes
│  - installed: from disk     │  the UI into wire messages
└─────────────────────────────┘
```

- **Native UI** — the shell renders three view types (`list`, `grid`,
  `detail`) from a serialized UI tree; extensions write React with
  `@flowkey/react-ui` and never touch the screen directly.
- **Capability gates** — every extension call (`http.fetch`, `clipboard.*`,
  `storage.*`, `secrets.*`, `shell.openUrl`, …) is checked against the
  extension manifest **and** the capabilities the user accepted at install
  time. `http.fetch` is allowlisted per host with SSRF protections.
- **Contract tests** — `contract/*.fixture.json` pins the wire protocol, UI
  tree and manifest validation; both the TypeScript and C# sides fail if
  they drift.

## Features

- **App search & launch** — Start Menu enumeration, usage-ranked results
- **Extension commands** — search, open and act on anything an extension
  contributes (list, grid and detail views with a `Ctrl+K` action panel)
- **Bundled extensions** — Emoji & Symbols, Apps, Clipboard History, Google
  Translate, Spotify, Lucide Icons
- **Third-party extensions** — install `.flowkey` packages from
  **Settings → Extensions → Install from file…** with a capability consent
  dialog; uninstall purges all extension data
- **Clipboard history** — text, files and images, with per-entry actions
- **Calculator** — instant evaluation, units and dates
- **Per-command hotkeys, favorites and usage ranking**
- **HUD overlays** and toasts for extension feedback
- **Auto-updates** via GitHub Releases (Velopack)

## Building an extension

```bash
pnpm dlx @flowkey/cli init "My Extension"
cd my-extension && pnpm install
pnpm dev        # build + install into FlowKey + watch
pnpm package    # produce the .flowkey zip to share
```

See [`flowkey-native/docs/extension-quickstart.md`](flowkey-native/docs/extension-quickstart.md)
for the tutorial,
[`flowkey-native/docs/extension-format.md`](flowkey-native/docs/extension-format.md)
for the package/manifest spec and
[`flowkey-native/docs/extension-capabilities.md`](flowkey-native/docs/extension-capabilities.md)
for the capability & consent model.

## Development

Prerequisites: [.NET 8 SDK](https://dotnet.microsoft.com), [Bun](https://bun.sh),
pnpm 10, Node 20+.

```bash
cd flowkey-native
pnpm install
pnpm test       # typechecks + bun tests + dotnet tests
```

Build or run the shell by opening `flowkey-native/shell/FlowKey.sln` in
Visual Studio (or `dotnet build`/`dotnet run` on
`flowkey-native/shell/src/Shell/Shell.csproj`). The repository layout and
release flow are described in
[`.agents/skills/dev-environment/SKILL.md`](.agents/skills/dev-environment/SKILL.md).

## License

See [LICENSE](LICENSE).
