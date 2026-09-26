---
name: dev-environment
description: Reference for the FlowKey repository structure, the two pnpm workspaces, lockfile discipline, CI workflows, and release flow. Use this skill whenever working on anything related to pnpm workspace setup, workspace linking, lockfile errors, version bumps, CI configuration, release workflows, or questions about how local dev differs from CI. Also triggers for "how does the workspace work", "where do I run pnpm install", or any confusion about the repo layout.
---

# FlowKey Development Environment

## Repository Structure

FlowKey lives at the repo root (GitHub: `GabrielSantos23/flowkey-launcher`):

```
├── package.json              ← root: prettier + husky tooling ONLY (packages: [])
├── pnpm-workspace.yaml       ← root workspace is tooling-only; prettier covers the whole repo
├── pnpm-lock.yaml            ← root lockfile (prettier/husky)
├── .github/workflows/
│   ├── release-shell.yml     ← shell-v* tags → dotnet test + Velopack GitHub Release
│   ├── release-flowkey-sdk.yml ← flowkey-sdk-v* tags → TS tests + npm publish (@flowkey/*)
│   └── codeql.yml
├── flowkey-native/           ← THE product; its OWN pnpm workspace + own lockfile
│   ├── pnpm-workspace.yaml   ← members: cli, sdk, sidecar, react-ui, extensions/* (allowBuilds: esbuild)
│   ├── package.json          ← scripts: sdk:*, cli:*, react-ui:*, sidecar:*, shell:*, *:typecheck/:test, icons:sync
│   ├── contract/             ← canonical JSON fixtures (protocol, ui-tree, manifest) — tested by bun AND xunit
│   ├── sdk/                  ← @flowkey/native-sdk (types, manifest validation, capabilities)
│   ├── cli/                  ← @flowkey/cli (flowkey init/dev/build/validate/package) + shims/ + templates/
│   ├── sidecar/              ← the Bun extension host (loads first-party statically, installed from disk)
│   ├── react-ui/             ← @flowkey/react-ui (react-reconciler → UI tree)
│   ├── extensions/           ← first-party extensions (emoji, apps, clipboard-history, google-translate, spotify, react-demo, lucide-icons)
│   ├── scripts/              ← sync-lucide-icons.mjs (icon metadata generator)
│   ├── shell/                ← FlowKey.sln: WPF shell (src/Shell) + xunit tests (tests/Shell.Tests)
│   └── docs/                 ← extension developer docs (quickstart, format, capabilities)
├── raycast-extensions/       ← reference sources being ported (lucide-icons)
├── benchmarks/, design-reference/, docs/images/  ← legacy-era assets, not part of the product build
```

## Two Workspaces — Know Which One You're In

- **Repo root**: tooling only (prettier, husky, lint-staged). `packages: []` — never add packages here. Run `pnpm exec prettier …` from the root (it covers `flowkey-native/`).
- **`flowkey-native/`**: all product packages. `pnpm install` here regenerates `flowkey-native/pnpm-lock.yaml`. Workspace linking: `workspace:*` deps (e.g. extensions importing `@flowkey/native-sdk`) become symlinks after install.
- `esbuild` runs a postinstall script; `allowBuilds: { esbuild: true }` in `flowkey-native/pnpm-workspace.yaml` authorizes it. A failing install printing "Ignored build scripts" means that field was lost.

## Lockfile Discipline

- `flowkey-native/pnpm-lock.yaml` must be regenerated (`pnpm install` inside `flowkey-native/`) whenever any package.json under `flowkey-native/` changes. Commit it alongside.
- CI runs `pnpm install --frozen-lockfile` in `flowkey-native/` — a stale lockfile fails the release.

## Build & Test Commands (from `flowkey-native/`)

| Command            | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `pnpm test`        | full matrix: all typechecks → all bun suites → `dotnet test FlowKey.sln` |
| `pnpm shell:build` | `dotnet build FlowKey.sln -c Release`                                    |
| `pnpm icons:sync`  | regenerate `extensions/lucide-icons/src/generated/` from `lucide-static` |
| `pnpm cli:build`   | bundle `@flowkey/cli` to `dist/cli.js` (+ copies `shims/`)               |

## Release Flows

- **Shell**: tag `shell-v*` → `release-shell.yml` (test job excludes environment-dependent xunit filters → build job: `dotnet publish --self-contained`, `bun build --compile` the sidecar into `FlowKey.Sidecar.exe`, tar sidecar/src + extensions + contract fixture beside the exe, `vpk pack`). The shell locates the repo tree at runtime by walking up to find `contract/ui-tree.fixture.json`.
- **TS packages**: tag `flowkey-sdk-v*` → `release-flowkey-sdk.yml` → publishes `@flowkey/native-sdk`, `@flowkey/react-ui`, `@flowkey/cli` (requires the `NPM_TOKEN` secret and the `@flowkey` npm org to exist). `pnpm publish` rewrites `workspace:*` deps to real versions.
- Never tag manually without running the version bumps first (`npm version` in the package + lockfile refresh).
