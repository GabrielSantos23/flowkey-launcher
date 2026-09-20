# flowkey-native

Native C# / .NET 8 WPF shell for FlowKey with TypeScript extensions running in
a bun sidecar process. This folder is **outside** the root pnpm workspace
(`pnpm-workspace.yaml` globs do not match it) and is fully independent of the
existing Tauri app, Rust host and `asyar-sdk`.

## Layout

- `contract/` — canonical JSON fixtures (UI tree + protocol). The single
  source of truth: the bun test in `sdk/` and the xunit test in `shell/tests/`
  both validate their models against these exact bytes, so contract drift
  fails both sides.
- `sdk/` — `@flowkey/native-sdk`, the TypeScript SDK for the new extension
  model (UI-tree types, protocol messages, `defineExtension`).
- `sidecar/` — the sidecar process: loads extensions, speaks NDJSON over
  stdin/stdout with the shell.
- `extensions/` — new-model extensions (first: `emoji`).
- `shell/` — the WPF shell (`FlowKey.sln`, `FlowKey.Shell` + xunit tests).

## Commands

Run from this folder (or via `pnpm --dir flowkey-native <script>` from the
repo root):

| script              | what it does                         |
| ------------------- | ------------------------------------ |
| `sdk:test`          | bun test for the SDK contract        |
| `sdk:typecheck`     | TypeScript check for `sdk/`          |
| `sidecar:typecheck` | TypeScript check for `sidecar/`      |
| `shell:build`       | `dotnet build` (Release)             |
| `shell:test`        | `dotnet test` (xunit contract tests) |
| `test`              | sdk:test + shell:test                |

## Protocol (v1)

Newline-delimited JSON, one object per line, over the sidecar's stdin/stdout.
See `contract/protocol.fixture.json` for exact shapes.

- Host → sidecar: `init` (carries `protocolVersion`, `extensionsDir`,
  `preferences`), `search`, `action`, `preferences`.
- Sidecar → host: `ready` (carries `protocolVersion` + per-extension
  `nativeMethods` / `httpHosts` declarations), `ui`, `error`, `nativeCall`,
  `nativeResult`, `log`.
- The shell refuses to run against a sidecar whose `protocolVersion` differs
  from its own; the mismatch is reported as an error, never a silent failure.

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

## Bun requirement

The sidecar requires [bun](https://bun.sh) on PATH. If the shell cannot find
bun it shows a clear error toast; it never crashes.

## Manifest

Extensions declare their capabilities up front in `manifest.json`
(`nativeMethods`, `httpHosts`), pinned in `contract/protocol.fixture.json`.
