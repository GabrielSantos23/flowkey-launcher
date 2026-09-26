# Code Formatting & Linters

- **Agent Formatting Requirement**:
  - Editor format-on-save does not automatically run on files created or edited by agents.
  - Before concluding a task, ensure all touched files are formatted:
    - **JS / TS / TSX / JSON / Markdown / YAML**: `pnpm exec prettier --write <file>` (run from the repo root; prettier covers `flowkey-native/` including the C# project's sibling TS packages)
    - **C#**: match the surrounding file's conventions (expression-bodied members where used, file-scoped namespaces, `sealed` types, explicit usings). `dotnet build` must stay warning-clean for new code.
- **Untracked directories**: `git status --short` collapses new directories to a single entry — run prettier over new directories explicitly (e.g. `pnpm exec prettier --write "flowkey-native/new-pkg/**/*.{ts,tsx,json,md}"`), not only over the modified-file list.
