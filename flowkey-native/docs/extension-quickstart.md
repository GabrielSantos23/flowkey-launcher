# Build your first FlowKey extension

This tutorial walks you from zero to an installed FlowKey extension written in
TypeScript + React.

## Prerequisites

- [Node.js](https://nodejs.org) 20+ (or [Bun](https://bun.sh)) and pnpm 10
- FlowKey installed (or a local `flowkey-native` build for development)

The extension you build runs inside FlowKey's sidecar process. At runtime it
shares the host's React and UI component instances — your bundle is built with
`@flowkey-cli/cli`, which wires that up automatically. You never configure this.

## 1. Scaffold a project

```bash
pnpm dlx @flowkey-cli/cli init "My Extension"
# or: npm exec @flowkey-cli/cli -- init "My Extension"
cd my-extension
pnpm install
```

This creates a project with a `manifest.json` (declares your id, commands and
the capabilities you use), a `src/index.tsx` entry, and scripts wired to the
CLI.

## 2. Run it live

```bash
pnpm dev
```

`dev` builds your extension into `dist/`, installs it into
`%LOCALAPPDATA%\FlowKey.Shell\extensions\<id>\`, and rebuilds on every change.
Restart FlowKey to (re)load the extension.

## 3. Understand the shape of an extension

An extension is a React component that renders FlowKey's UI primitives —
`List`, `Grid`, `Detail`, `ActionPanel`, `Action` — plus a manifest declaring
what it can do:

- **`commands`** — entries that appear in the launcher (search by title and
  keywords). `mode: "view"` opens your React view; `mode: "background"` runs a
  plain action.
- **`nativeMethods`** — the host capabilities you call (`http.fetch`,
  `clipboard.write`, `storage.*`, …). Exact names or `namespace.*` wildcards.
- **`httpHosts`** — the only hosts `http.fetch` will contact.
- **`oauth`** — OAuth providers (e.g. `"spotify"`) whose tokens the shell
  manages for you.

The component receives props with everything you need:

```tsx
function DemoView(props: CommandProps) {
  // props.query      — what the user typed
  // props.preferences — the user's configured values for this extension
  // props.capabilities — typed API groups (http, storage, clipboard, …)
  // props.native.call  — raw escape hatch for any native method
}
```

## 4. Package and share

```bash
pnpm package   # produces <id>-<version>.flowkey
```

Send the `.flowkey` file anywhere. Whoever receives it opens
**FlowKey → Settings → Extensions → Install from file…**, picks the package,
reviews the capability consent dialog, and the extension appears in their
launcher. Uninstalling removes the extension **and** all of its data
(storage, secrets, OAuth tokens).

## 5. Release notes

- Bump `version` in `manifest.json` for every package you distribute. FlowKey
  only installs a package whose version is strictly newer than the installed
  one.
- If an update adds new capabilities, the new ones stay locked until the user
  reviews them on the extension's settings page ("Review permissions").
- Validate manifests at any time with `pnpm validate`.
