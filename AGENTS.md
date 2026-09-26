# FlowKey Project Agent Guidelines & Rules

The following rules are mandatory across all agent sessions, subagents, and tasks in this repository.

## 1. Strict Git Policy (NO Git Writes Without Asking)

- **NEVER** run `git add`, `git commit`, `git push`, `git stash`, or any other git command that modifies repository state.
- Do NOT commit even if a workflow or skill prompts to do so.
- The user commits and pushes everything themselves.
- Always leave working tree changes clean, uncommitted, and unstaged for user review.

## 2. No AI Attribution

- **NEVER** add `Co-Authored-By: Claude ...`, `Co-Authored-By: Gemini ...`, or any other AI attribution trailer to git commits, pull request titles/descriptions, or comments.

## 3. Mandatory Verification & Local CI Matrix

Before concluding any implementation, bug fix, or refactor, **ALWAYS** run the full verification matrix:

```bash
pnpm --dir flowkey-native test
```

This chains (from `flowkey-native/package.json`):

1. **TypeScript typechecks**: `sdk:typecheck`, `react-ui:typecheck`, `cli:typecheck`, `sidecar:typecheck`, plus per-extension `*:typecheck`
2. **Bun test suites**: `sdk:test`, `react-ui:test`, `cli:test`, per-extension `*:test`, `sidecar:test`
3. **C# shell tests**: `shell:test` (`dotnet test flowkey-native/shell/FlowKey.sln`)

When C# code is touched, also build without warnings: `pnpm --dir flowkey-native shell:build`.

## 4. Formatting Enforcement

- Format-on-save does not run automatically on files edited by agents.
- Before concluding a task, ensure modified files are formatted:
  - JS/TS/TSX/JSON/MD/YAML: `pnpm exec prettier --write <file>` (run from the repo root; prettier covers `flowkey-native/` too)
  - C#: match the surrounding style; `dotnet build` must stay warning-clean for new code (existing warnings must not grow)

## 5. Architectural Invariants

- **Shell-is-the-gate, sidecar-is-the-brain**: the C# shell owns all privileged operations (filesystem, clipboard, network, OAuth, secrets, media, storage) and enforces manifest + consent policy on every native call. Extensions never touch the OS directly.
- **Contract fixtures are law**: `flowkey-native/contract/*.fixture.json` (protocol, UI tree, manifest validation) is tested by BOTH the bun suites and the xunit suite. Any protocol or validation change updates the fixture and both sides together.
- **Thin code-behind**: WPF window code-behind orchestrates only; install/validation/policy logic lives in testable classes under `Native/` (see `ExtensionPackageInstaller`, `ExtensionPolicy`).
- **Generic capabilities, not extension hacks**: new extension-facing features are added as generic, manifest-gated native routes or UI primitives usable by any extension — never special-cased for one extension.
- **Fail-closed consent**: an installed extension's effective capabilities are `manifest ∩ stored consent`; updates that add capabilities stay locked until the user re-accepts.

## 6. Tech Stack Standards

- **Shell**: .NET 8 WPF (`flowkey-native/shell`), WPF-UI 4, Velopack updates. Pure WPF views bound to view models — no WebView.
- **Sidecar & extensions**: TypeScript running under Bun (`flowkey-native/sidecar`), React rendered through `@flowkey/react-ui`'s custom reconciler. Extension bundles alias `react` / `@flowkey/*` to host globals — they must never bundle their own React copy.
- **No AI features**: the product intentionally has no AI/LLM capability; do not add AI-dependent behavior.

## 7. Keyboard Shortcuts & Input Safety

- **Preserve Text Editing**: Never bind native text editing shortcuts (`Ctrl+Backspace`, `Ctrl+A`, etc.) to list actions or item deletion.
- **Destructive Actions in Ctrl+K**: Item deletion and trashing belong in the `Ctrl+K` Action Panel, never bound directly to `Ctrl+Backspace` / `Delete`.

## 8. Rules, Skills & Memories Structure

- Modular rules: `.agents/rules/*.md`
- On-demand procedural skills: `.agents/skills/*/SKILL.md`
- Project memory index: `.agents/memories/MEMORY.md`
