# The .flowkey package format

A `.flowkey` file is a plain zip archive. There is no custom container — any
zip tool can inspect one.

## Layout

```
manifest.json      ← required, at the zip root
main.js            ← required (bundled ES module; name from manifest.entry)
README.md          ← optional
icon.png           ← optional, referenced by your UI if needed
```

- `manifest.json` must sit at the **root** of the archive.
- The entry file is a single self-contained bundled `.js` module (the default
  name is `main.js`, overridable with the `entry` manifest field). It must be
  a single filename — subdirectories in the package are allowed, but the
  entry cannot live in one.
- Build both with `flowkey package` — hand-rolled packages must satisfy the
  same rules.

## Install rules enforced by the shell

- **Zip-slip**: archive entries that traverse outside the install directory
  (`..`, absolute paths, drive letters) reject the package.
- **Size caps**: 32 MB per entry, 64 MB total, 512 entries.
- **Version conflict**: a package is only installed if its semver is strictly
  newer than the installed version.
- **Consent**: installation requires the user to accept every declared
  capability (native methods, http hosts, OAuth providers). The accepted set
  is stored and enforced per native call afterwards.

Installed extensions live in `%LOCALAPPDATA%\FlowKey.Shell\extensions\<id>\`
(override with `FLOWKEY_EXTENSIONS_DIR` for tests).

## Manifest reference

| Field             | Type         | Rules                                                                                                         |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `id`              | string       | lowercase slug `^[a-z0-9][a-z0-9._-]*$`, no `..`, becomes the install directory name                          |
| `name`            | string       | 2–50 characters, shown in the launcher                                                                        |
| `version`         | string       | semver `major.minor.patch` with optional pre-release/build                                                    |
| `description`     | string?      | up to 200 characters                                                                                          |
| `icon`            | string?      | an emoji                                                                                                      |
| `entry`           | string?      | bundled entry filename, default `main.js`                                                                     |
| `commands[]`      | Command[]    | at least one; unique lowercase ids; `mode` is `"view"` (React view) or `"background"` (runs and reports back) |
| `nativeMethods[]` | string[]     | exact methods (`http.fetch`) or namespace wildcards (`storage.*`)                                             |
| `httpHosts[]`     | string[]     | exact hosts (`api.example.com`), suffix wildcards (`.cdn.example.com`), optional `:port`                      |
| `oauth[]`         | string[]     | provider ids (e.g. `"spotify"`)                                                                               |
| `preferences[]`   | Preference[] | user-configurable values (`text`, `password`, `checkbox`, `dropdown`), edited in Settings                     |

Commands additionally accept `title`, `keywords` (search terms), `icon`,
`iconColor`.

The `__open__` command id is reserved by the shell.

Validation is implemented twice — in
`@flowkey/native-sdk` (`validateManifest`, used by the CLI and the sidecar)
and in the shell's installer (`ExtensionManifestValidator.cs`) — and both are
pinned to identical behavior by `contract/manifest.fixture.json`.
