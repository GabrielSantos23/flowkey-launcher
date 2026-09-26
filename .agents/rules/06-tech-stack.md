# Technology Stack & Framework Rules

## 1. C# Shell (.NET 8 WPF)

- `flowkey-native/shell` targets `net8.0-windows` with WPF + WinForms interop and WPF-UI 4.
- Views are XAML + code-behind bound to view models under `Rendering/`; there is **no WebView** — extension UI arrives as a serialized tree (`Protocol/UiTree.cs`).
- New shell logic goes into `Native/*.cs` or `Rendering/*.cs` classes, not into code-behind.
- XAML resources are theme brushes (`CellBackgroundBrush`, `TextPrimaryBrush`, …) — reference them via `DynamicResource`, never hardcode colors.

## 2. TypeScript Sidecar & Extensions (Bun)

- The sidecar runs under Bun (`flowkey-native/sidecar`); the shared TS workspace lives in `flowkey-native/` (its own pnpm workspace, independent of the repo root).
- Extension UI is **React rendered through `@flowkey/react-ui`'s custom reconciler** (`react-reconciler` → serialized UI tree). Extension components receive everything as props (`CommandProps`); there is no DOM.
- Extension bundles must alias `react`, `@flowkey/react-ui` and `@flowkey/native-sdk` to the host-global shims (`cli/shims/`) — bundling a second React copy breaks hooks and serialization. Use `@flowkey/cli` to build.
- The SDK (`@flowkey/native-sdk`) is types + manifest validation + typed capabilities; it is runtime-dependency-free.

## 3. No AI Features

- The product intentionally ships no AI/LLM capability. Do not add AI-dependent behavior, providers or UI.
