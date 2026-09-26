---
name: tdd
description: Use when implementing any new feature or fixing any bug in this project — both the C# shell (flowkey-native/shell) and the TypeScript packages (sdk, cli, react-ui, sidecar, extensions). Triggers on phrases like "add X", "fix Y", "implement Z", "change how W works".
---

# Test-Driven Development

Write a failing test first. Then write only enough code to make it pass. No exceptions.

## The Iron Law

**NO IMPLEMENTATION BEFORE A FAILING TEST.**

Write code before a test? Delete it. Start over.

**No exceptions:**

- Not for "trivial" functions
- Not for "obvious" logic
- Not for bug fixes ("I just need to change one line")
- Don't keep it as "reference" while writing tests
- Delete means delete

## RED-GREEN-REFACTOR

1. **RED**: write the smallest test that expresses the missing behavior. Run it, watch it fail for the right reason.
2. **GREEN**: write only enough implementation to pass. Resist generalizing early.
3. **REFACTOR**: clean both while the tests stay green.

## Where tests live

| Area                                                 | Runner                                                   | Location                                  |
| ---------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| C# shell (`Native/`, `Rendering/`, `Sidecar/` logic) | xunit via `dotnet test flowkey-native/shell/FlowKey.sln` | `flowkey-native/shell/tests/Shell.Tests/` |
| SDK (manifest validation, capabilities, contract)    | `bun test` in `flowkey-native/sdk`                       | `sdk/test/`                               |
| react-ui (serializer, reconciler)                    | `bun test` in `react-ui/`                                | `react-ui/test/`                          |
| CLI (scaffold, build, package)                       | `bun test` in `cli/`                                     | `cli/test/`                               |
| Sidecar (loader, bridge, roots, dispatcher)          | `bun test` in `sidecar/`                                 | `sidecar/test/`                           |
| Extensions (pure logic + manifest)                   | `bun test` in the extension dir                          | `extensions/*/test/`                      |
| Contract fixtures                                    | BOTH bun + xunit                                         | `flowkey-native/contract/*.fixture.json`  |

Run the targeted suite while iterating (`cd flowkey-native/shell && dotnet test --filter "FullyQualifiedName~ExtensionPackageInstaller"` or `cd flowkey-native/sdk && bun test`); run the full matrix (`pnpm --dir flowkey-native test`) before concluding.

## Test design rules for this codebase

- **Pure logic first**: keep decisions in testable classes (`Native/*.cs`, `sdk/src/*.ts`), not in code-behind or the sidecar's message loop — the TDD entry point follows the architecture.
- **Fixture-driven behavior**: when both sides must agree (manifest validation, protocol shapes), the failing test is a fixture case in `contract/` wired into both suites — one test addition enforces parity on two runtimes.
- **Shell/UI code**: WPF code-behind is not unit-tested; extract the decision (e.g. `ExtensionPolicy`, `SemVer`, zip validation) and test that. Rendering glue is verified by build + manual E2E.
- **Sidecar E2E**: driver scripts can pipe NDJSON (`init` → `search` → `action`) into `bun sidecar/src/main.ts` and assert the emitted `ready`/`ui` messages; keep stdin open until responses arrive (`(cat input; sleep 2) | bun sidecar/src/main.ts`).

## Bug-fix protocol

1. Reproduce with a failing test that encodes the buggy behavior's exact input and expected output.
2. Fix minimally.
3. Check for the same pattern nearby (the bug's root cause, not just its instance).
