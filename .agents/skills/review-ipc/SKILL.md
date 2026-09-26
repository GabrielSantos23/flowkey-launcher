---
name: review-ipc
description: Audit the sidecar IPC protocol between extensions and the FlowKey shell. Use when adding a new native method/route, adding or changing a protocol message, changing a message field, adding a capability gate, or reviewing consent/declaration coverage.
allowed-tools: Read, Grep, Glob
---

# review-ipc

Audit the NDJSON protocol layer across the SDK types, the sidecar dispatcher, and the shell's native-call gate for correctness and completeness.

## Context: the sidecar protocol

The shell and sidecar exchange **newline-delimited JSON over stdin/stdout** (`Shell/Sidecar/SidecarHost.cs` ⇄ `sidecar/src/main.ts`), pinned by `flowkey-native/contract/protocol.fixture.json` and tested on both sides (bun + xunit). Protocol version is 1; the shell refuses a sidecar whose `protocolVersion` differs.

- **Host → sidecar**: `init` (protocolVersion, extensionsDir, preferences, disabledExtensions), `search` (requestId, extensionId, query, commandId, filterValue), `action` (requestId, extensionId, actionId, item), `preferences` (extensionId, values), `nativeResult` (requestId, ok, result|error)
- **Sidecar → host**: `ready` (extensions[] with nativeMethods/httpHosts/oauth, failures[]), `ui` (requestId, tree), `uiPush` (extensionId, commandId, query, filterValue, tree), `error` (requestId, error), `nativeCall` (requestId, extensionId, method, params), `ack`, `log`

Extension→capability calls ride `nativeCall`/`nativeResult` with per-request correlation; UI delivery rides `ui`/`uiPush` with stale-response discipline (a `uiPush` only applies when extensionId/commandId/query/filterValue match the current view).

## What to check

### 1. Message shape changes are three-sided

Any field added to or removed from a message touches, in the same change:

1. `flowkey-native/sdk/src/types.ts` (the TS wire types)
2. `flowkey-native/shell/src/Shell/Protocol/Messages.cs` (the C# mirror)
3. `flowkey-native/contract/protocol.fixture.json` (the pinned bytes) + assertions in `sdk/test/contract.test.ts` AND `Shell.Tests` (`UiTreeFixtureTests`/`ProtocolFixtureTests`)

A one-sided change silently breaks the other side — the fixture tests exist to make that loud.

### 2. New native methods (capability routes)

A new `namespace.method` route requires ALL of:

- **Shell handler**: registration in `MainWindow` (`nativeMethods.Register(...)` or an explicit branch in `OnNativeCallRequested` for extensionId-scoped handlers, following the `secrets.*` / `storage.*` pattern) + a thin `Native/` implementation with xunit coverage
- **Gate**: the caller must have declared the method — `OnNativeCallRequested` checks `NativeMethodPolicy.IsDeclared(effective, method)` where effective = ready-declared (first-party) or `manifest ∩ consent` (installed). Wildcards (`storage.*`) are supported; exact matches always win
- **SDK ergonomics**: a typed wrapper in `sdk/src/capabilities.ts` (`ctx.<group>.<method>`) built over `native.call` — extensions never hand-roll method strings
- **Fixture**: a `nativeCall` example in `contract/protocol.fixture.json` asserting the wire shape
- **Consent surface**: the method must be declarable in a manifest (`validateManifest`'s `nativeMethods` pattern check) so the install-time consent dialog can show it

### 3. Fail-closed policy

- An undeclared method fails with `methodNotDeclared`; an unconsented capability of an installed extension is invisible to it (`ExtensionPolicy` intersection)
- Async routes (http/oauth/image) complete via `SendNativeResult` — verify every branch calls `CompleteNativeCall` exactly once (double-complete or a dropped requestId hangs the extension's promise until timeout)
- Errors use `{ code, message }` with stable lowercase codes matching the C# `NativeCallOutcome.Failure` values

### 4. Transport discipline

- `SidecarHost` writes via a single background writer thread; handlers must not block the UI thread on sidecar I/O
- `init` is async in the sidecar: messages arriving before `ready` are queued until the dispatcher swap — never process host messages against the previous dispatcher
- Fatal conditions (protocol mismatch, spawn failure) surface as `Fatal`, never as silent process death

### 5. No payload impersonation

Every `nativeCall` carries `extensionId` for attribution and the shell resolves declarations by that id only — no message body field may override identity, and extensionId-scoped stores (storage, secrets, tokens) must derive their slice from the attributed id.
