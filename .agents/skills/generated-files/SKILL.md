---
name: generated-files
description: Never hand-edit or hand-copy generated content. Use when touching contract fixtures (protocol.fixture.json, ui-tree.fixture.json, manifest.fixture.json), the lucide-icons generated metadata, the compiled sidecar exe, or whenever you are about to hand-copy a list/type that exists on both the TypeScript and C# sides.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# generated-files

**Principle:** every artifact that exists in more than one place has exactly
**one** hand-written source (or generator). The other copies are produced.
If you type a copy by hand, it will drift — and drift here has already
shipped real bugs in other projects (a gate that allowed everything, a
validator that rejected a valid manifest).

## The two rules

1. **Never edit a generated file.** Edit its source, then run the generator.
2. **Never create a new hand-synced mirror.** If two sides need the same
   data, extract a fixture or write a generator — do not paste it and add a
   "keep in sync" comment.

## Generated artifacts in this repo

| Artifact                                                                        | Source                               | Generator                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `flowkey-native/contract/*.fixture.json`                                        | hand-authored (they ARE the source)  | none — but BOTH sides must assert against them; a fixture change without matching assertions on both sides is incomplete |
| `extensions/lucide-icons/src/generated/lucide-metadata.json` (+ `version.json`) | `lucide-static` npm package          | `pnpm --dir flowkey-native icons:sync`                                                                                   |
| `FlowKey.Sidecar.exe`                                                           | `sidecar/src` + workspace extensions | `bun build --compile` (release CI does this; never present in the repo)                                                  |
| `flowkey-native/*/node_modules`                                                 | package.json deps                    | `pnpm install` inside `flowkey-native/`                                                                                  |

## The contract-fixture discipline (the critical one)

`contract/protocol.fixture.json`, `ui-tree.fixture.json` and
`manifest.fixture.json` are consumed by **both** implementations:

- TypeScript: `sdk/test/contract.test.ts`, `sidecar/test/loader.test.ts`
- C#: `Shell.Tests/UiTreeFixtureTests.cs` (+ `ContractPaths`)

When you change a wire shape, a UI-tree node, or a validation rule:

1. Update the fixture JSON.
2. Update the TS assertions.
3. Update the C# assertions.
4. Run `pnpm --dir flowkey-native test` — both suites must pass.

Validator parity has an extra rule: `sdk/src/manifest.ts` (`validateManifest`)
and `Shell/Native/ExtensionManifestPolicy.cs` must accept and reject the exact
same manifests, pinned by `manifest.fixture.json`. If you add a rule to one,
mirror it in the other **and** add fixture cases covering it — otherwise the
CLI accepts packages the shell rejects (or vice versa).

## Extension metadata

Never hand-edit `extensions/lucide-icons/src/generated/`. It is regenerated
from the `lucide-static` package (icon-nodes + tags) by
`scripts/sync-lucide-icons.mjs`. To update icons: bump `lucide-static` in
`flowkey-native/package.json`, run `pnpm icons:sync`, commit the regenerated
files.
