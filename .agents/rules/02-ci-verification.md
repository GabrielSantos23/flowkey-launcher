# Mandatory Local CI Verification Matrix

Before concluding any implementation, bug fix, or refactor, **ALWAYS** run the full verification matrix:

```bash
pnpm --dir flowkey-native test
```

### Steps executed by the chain:

1. **TypeScript typechecks**: `sdk:typecheck`, `react-ui:typecheck`, `cli:typecheck`, `sidecar:typecheck`, plus per-extension `*:typecheck`
2. **Bun test suites**: `sdk:test`, `react-ui:test`, `cli:test`, per-extension `*:test`, `sidecar:test`
3. **C# shell tests**: `shell:test` (`dotnet test flowkey-native/shell/FlowKey.sln`)

### Additional gates by touched area

- **C# code**: `pnpm --dir flowkey-native shell:build` — new code must not add warnings
- **Extension icon metadata**: after changing `scripts/sync-lucide-icons.mjs` or bumping `lucide-static`, run `pnpm --dir flowkey-native icons:sync` and commit the regenerated `extensions/lucide-icons/src/generated/` files
- **Contract fixtures** (`flowkey-native/contract/*.fixture.json`): a change must be accompanied by the matching assertions on BOTH sides (bun + xunit) in the same change
- **Repo-wide formatting**: `pnpm exec prettier --check .` from the repo root (prettier covers `flowkey-native/`)

CI (`.github/workflows/`) mirrors these: `release-shell.yml` (dotnet test + Velopack build on `shell-v*` tags) and `release-flowkey-sdk.yml` (TS package tests + npm publish on `flowkey-sdk-v*` tags).
