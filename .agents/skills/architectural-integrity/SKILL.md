---
name: architectural-integrity
description: Use before planning or implementing ANY feature, bug fix, refactor, or API change that touches FlowKey's architecture — the extension system, native capability routes, the sidecar protocol, UI-tree primitives, manifest/consent policy, or cross-layer data flow. Triggers on new features, new extension APIs, new native routes, protocol changes, bug fixes involving multiple layers, refactors of infrastructure code, and any work that affects how first-party or third-party extensions interact with the platform. Also triggers when deciding which layer owns a piece of logic, whether an extension can use a capability, or whether a change requires a manifest/consent/fixture update. Does NOT trigger for pure styling fixes (use design-language), isolated unit tests, documentation updates, version bumps, mechanical renames, or informational questions.
---

# Architectural Integrity

FlowKey is a platform, not an app. Every decision — features, bug fixes, refactors — must be made from a platform-level perspective: the C# shell is a thin, gated runtime that renders whatever the TypeScript sidecar serializes, and every extension capability is generic, declared, and consented.

## Product Mindset

FlowKey is in active development. Breaking changes to the sidecar protocol, SDK, or manifest schema are acceptable when they produce a cleaner platform — both sides ship together and the contract fixtures are the compatibility boundary. Never add shims or legacy fallbacks inside the protocol.

## Principle 1: The Shell Is the Gate, the Sidecar Is the Brain

### The Pattern

All privileged operations live in the C# shell (`flowkey-native/shell`): clipboard, filesystem, network (`HttpPolicy`), OAuth, DPAPI secrets, media, storage, package install. Extensions run in the Bun sidecar and reach capabilities **only** through `nativeCall` routes that the shell gates per call against the extension's effective declarations.

- **Effective declarations** = ready-reported manifest (first-party) or `on-disk manifest ∩ stored consent` (installed) — computed by `ExtensionPolicy`. A manifest can never grant more than the user accepted.
- **Fail closed**: undeclared → `methodNotDeclared`; unconsented capabilities are invisible (intersection), never denied-with-details leaks.

### How to apply

- New extension-facing functionality = a new generic native route (`Native/*.cs` + registration + SDK capability wrapper + manifest-declarable name), never a shell code path keyed on an extension id.
- OS access in the sidecar is a design smell: if TypeScript needs the OS, the shell must expose a gated route for it.
- Keep handlers thin: dispatch in `MainWindow.OnNativeCallRequested`, logic in `Native/` classes with xunit coverage.

### Real examples

**Good — `storage.*`**: per-extension JSON KV store (`ExtensionStorageStore`) with caps, dispatched by the attributed extensionId, declared via `storage.*` or exact methods, wrapped as `ctx.storage` in the SDK.

**Good — `ExtensionPolicy`**: pure intersection logic with tests; `MainWindow` consumes it without knowing consent details.

**Anti-pattern — anything extension-specific in the shell**: `if (extensionId == "spotify")` belongs nowhere.

## Principle 2: Contract Fixtures Are the Wire Law

`flowkey-native/contract/` (protocol, ui-tree, manifest fixtures) is the single compatibility boundary between the C# shell and the TypeScript sidecar/SDK. Any protocol, UI-tree, or validation change updates the fixture AND assertions on both sides in the same change. Validator parity (`sdk/src/manifest.ts` ⇄ `Native/ExtensionManifestPolicy.cs`) is pinned the same way. See the `generated-files` skill.

## Principle 3: Generic Capabilities, Not Extension Hacks

Every extension-facing addition must be usable by any extension:

**Good — `IconSpec.svg`**: any extension can ship artwork as SVG content with a tint color; the shell parses it generically (`Rendering/SvgIcon.cs`).

**Good — `Grid.Section` / grid `filter` / `clipboard.paste`**: UI primitives and routes modeled on the platform's peers (list sections, list filter, clipboard history paste), not on one extension's needs.

**Anti-pattern — embedding an extension's assets in the shell**: if a capability only works because the host ships special data for one extension, redesign it as content the extension itself provides.

## Principle 4: Strict Layering

```
Extensions (React via @flowkey/react-ui)
  ↓ props (CommandProps) + typed capabilities
Sidecar (loader, dispatcher, roots)          ← TS only
  ↓ NDJSON protocol (contract fixtures)
Shell (SidecarHost, MainWindow)              ← C# orchestration
  ↓
Native services (Native/*.cs)                ← C# logic, xunit-covered
  ↓
OS (clipboard, network, DPAPI, media, fs)
```

- Data crossing any boundary is clean serializable JSON matching the fixtures — no class instances, no callbacks.
- WPF code-behind orchestrates; decisions live in testable classes.
- UI trees are produced by the sidecar only; the shell never synthesizes extension content.

## Principle 5: Consent Is the Security Product

The shared sidecar is NOT an isolation boundary (documented in `flowkey-native/README.md`). What protects the user is:

1. **Declaration**: manifests list exact capabilities (`nativeMethods`, `httpHosts`, `oauth`).
2. **Consent**: the install dialog shows every capability; the accepted set is stored and enforced per call.
3. **Re-consent**: upgrades that add capabilities keep them locked until reviewed.
4. **Purge**: uninstall removes the directory, storage, secrets, tokens, and caches.

When adding a capability, ask: "Can the consent dialog describe this in one line the user understands?" If not, redesign the capability.

## Session Start Protocol

1. Read the task; identify which layers it touches (extension → sidecar → protocol → shell → native).
2. Check for architectural violations in the area before building on them.
3. Proceed only with the layering, fixture discipline, and consent model intact.

## Quick Reference: Decision Checklist

- [ ] New capability is a generic, manifest-declarable route/primitive (not extension-specific)?
- [ ] Manifest + consent gate it, and the consent dialog can describe it plainly?
- [ ] Contract fixture updated with assertions on BOTH sides?
- [ ] Shell logic in testable `Native/` classes, code-behind thin?
- [ ] Cross-boundary data is clean fixture-conforming JSON?
- [ ] No AI-dependent behavior added (product decision: no AI features)?
- [ ] Root cause addressed, not symptoms patched?
