# Architecture & Core Invariants

## 1. Shell Is the Gate, Sidecar Is the Brain

- The C# shell owns every privileged operation: filesystem, clipboard, network (`HttpPolicy` allowlist + SSRF guards), OAuth, DPAPI secrets, media, storage, package install.
- Extensions run in the Bun sidecar and can do **nothing** except through `nativeCall` routes that the shell gates against the manifest and stored consent, per call.
- **Must be in the shell (C#)**: policy enforcement, validation, secrets, storage caps, package extraction, any OS access.
- **Must be in the sidecar (TS)**: extension loading, React rendering/serialization, search filtering, data shaping, caching that needs no privileges.
- When encountering shell logic that only makes sense for one extension, refactor it into a generic capability or into the extension.

## 2. Contract Fixtures Are the Wire Law

- `flowkey-native/contract/protocol.fixture.json`, `ui-tree.fixture.json` and `manifest.fixture.json` are tested by the bun suites AND the xunit suite.
- Any protocol, UI-tree or manifest-validation change updates the fixture and both implementations in the same change. A one-sided change is a bug.

## 3. Thin Code-Behind, Testable Classes

- WPF window code-behind (`MainWindow.xaml.cs`, `SettingsWindow.xaml.cs`) orchestrates and binds only.
- Decision logic (install rules, zip validation, policy intersection, semver, stores) lives in `Native/*.cs` classes with xunit coverage — see `ExtensionPackageInstaller`, `ExtensionPolicy`, `ExtensionManifestPolicy`.

## 4. Generic Capabilities, Not Extension Hacks

- Extension-facing features are generic manifest-gated native routes (`storage.*`, `shell.openUrl`, `clipboard.paste`) or generic UI primitives (`Grid.Section`, `Grid filter`, `IconSpec.svg`) that any extension can use.
- Never special-case an extension id in the shell or sidecar.

## 5. Fail-Closed Consent

- For installed extensions the shell computes effective capabilities as `on-disk manifest ∩ stored consent` (`ExtensionPolicy`). A manifest can never grant more than the user accepted.
- Updates that add capabilities keep the new ones locked until re-consent. Uninstall purges the directory, storage, secrets, OAuth tokens and cached images.

## 6. Never Hand-Edit Generated Files

- `extensions/lucide-icons/src/generated/` is produced by `pnpm --dir flowkey-native icons:sync` from `lucide-static` — never edit by hand.
- `FlowKey.Sidecar.exe` (bun `--compile`) is a build artifact; extensions load dynamically from disk, never by editing the compiled bundle.
