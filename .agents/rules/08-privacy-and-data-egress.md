# Privacy-First & Local-First Outbound Data Egress Policy

FlowKey is a local-first platform: user data stays on the device by default, and the only network egress is extension traffic the user explicitly consented to.

## 1. The Core Egress Invariant

**NO NETWORK REQUEST LEAVES THE DEVICE THROUGH FLOWKEY EXCEPT VIA `http.fetch`, WHICH IS GATED BY THE EXTENSION MANIFEST AND USER CONSENT, PER CALL.**

The sidecar has no direct networking role: extensions cannot open sockets. Every request goes through the shell's `HttpFetchService`.

## 2. Policy Matrix by Egress Channel

| Channel                                     | Gate                                                                                                                                                                                                      | Default                                     | Fail-Closed Behavior                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| **`http.fetch` (extension-initiated)**      | 1. `httpHosts` declared in the extension manifest<br>2. Host present in the stored consent record for installed extensions<br>3. `HttpPolicy` host allowlist match (exact host, `.suffix`, optional port) | **Denied** for undeclared/unconsented hosts | `HttpPolicy` failure — request never opens a socket |
| **`http.fetch` with OAuth token injection** | Provider declared in `manifest.oauth` **and** consented; tokens live in the DPAPI-encrypted `token-vault.json`, never sent to the sidecar                                                                 | **Denied** without declaration + consent    | `providerNotDeclared` failure                       |
| **`image.fetch`**                           | Same host allowlist as `http.fetch`                                                                                                                                                                       | **Denied** for undeclared hosts             | Failure; nothing cached                             |
| **Auto-update (Velopack)**                  | Built-in, GitHub Releases only (`GitHubReleasesSource`)                                                                                                                                                   | On, 6-hourly                                | Update checks are the only first-party egress       |

## 3. Defense-in-Depth Requirements

1. **Shell-Level Enforcement**: `HttpPolicy` independently validates every URL (allowlist, embedded-credential rejection, resolved-IP private/loopback/link-local blocking, redirect downgrade checks). Never rely on the extension to self-limit.
2. **Consent Intersection**: `ExtensionPolicy` computes effective capabilities as `manifest ∩ consent`; a manifest can never grant more than the user accepted at install (or re-accepted after an update).
3. **Secrets Never Transit**: DPAPI-encrypted secrets (`secrets.json`) and OAuth tokens are consumed inside the shell; extensions receive only derived results (e.g. `{ ok, expiresAt }`), never token material.
4. **Uninstall Purge**: removing an extension deletes its directory, storage, secrets, OAuth tokens and cached images — no orphaned user data.
5. **No Telemetry**: FlowKey ships no analytics, crash reporting or usage sharing. Do not add any.
