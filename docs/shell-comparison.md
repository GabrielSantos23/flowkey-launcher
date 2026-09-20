# Shell comparison — Tauri (WebView2) vs native C# WPF shell

Measured with `scripts/measure-idle.ps1` (private working set, Task Manager
method, summed over the app process, its `msedgewebview2.exe` descendants and
the sidecar). Idle = window hidden, no interaction, 5 minutes, each shell
measured with the other closed. All numbers from Release builds on the same
machine.

| shell                                                        | idle RAM (window hidden, 5 min): shell-only / sidecar / total | cold open (trigger → visible) | warm open     |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------- | ------------- |
| tauri                                                        | 79.2 / 0 (no sidecar at idle) / **210.2 MB**                  | not measured¹                 | not measured¹ |
| native                                                       | 77.2 / 12.4 / **89.6 MB**                                     | **82 ms**²                    | **15 ms**²    |
| native (phase 2: 4 extensions, app cache, clipboard history) | 89.7 / 15.8 / **105.5 MB**                                    | **93 ms**                     | **2 ms**      |

**Headline, stated honestly:** the native shell saves ~120 MB at idle — but
almost none of it comes from the app process itself (77.2 vs 79.2 MB). The
entire saving is the eliminated WebView2 group (~131 MB), which more than
absorbs the 12.4 MB bun sidecar. If the Tauri shell also ran extensions in a
bun sidecar at idle, its total would rise accordingly; conversely the native
sidecar cost scales with loaded extensions, not with the shell.

## Phase-2 delta, honestly stated

Adding the app launcher (287-entry cache + icon cache + usage store), the
clipboard history (in-memory list, DPAPI file) and two more loaded extensions
cost **+12.5 MB** on the shell process and **+3.4 MB** on the sidecar versus
Phase 1. The shell-only number is still below the Tauri app process alone.
If the launcher window is never summoned after boot (no WPF render surfaces
allocated), the same build idles at 49.8 + 14.1 = 63.9 MB total. Cold open
went from 82 ms to 93 ms with the app cache present (background build, first
open never blocked); warm open measured 2 ms this round (poll granularity
dominates; Phase-1's 15 ms remains the more representative warm figure).

## Build details

- **tauri row**: local Release build of `asyar-launcher` (`org.asyar.dev`
  identity via `tauri.dev.conf.json` overlay, updater disabled), **best-case
  window set: only the `main` window declared** (settings/island/snap-guides
  removed via a build-time config overlay; sticky/onboarding are already
  created on demand). Fresh empty profile; 6 `msedgewebview2.exe` processes
  (shared browser, one renderer, GPU, network, storage, crashpad).
- **native row**: `dotnet publish -c Release -r win-x64 --self-contained false`
  (framework-dependent; 246 KB on disk — **requires the .NET 8 Desktop Runtime
  on the target machine**). Sidecar: bun 1.4.2 running `sidecar/src/main.ts`
  with the emoji extension loaded (full catalog in memory). Window hidden,
  tray-resident.

## Open time

- **native**: cold 82 ms median (98/78/82 across 3 fresh processes), warm
  15 ms median (14/15/16/7/15 across 5 runs). Trigger = `WM_HOTKEY` posted
  into the process (the registered-hotkey delivery hop) → first visibility
  poll at 2 ms granularity. Physical keystroke delivery is not included.
- **R2R**: `PublishReadyToRun` (314 KB vs 246 KB on disk) measured cold median
  73 ms vs 82 ms — within run-to-run noise; warm identical at 15 ms. Not worth
  the size cost on this evidence.
- **tauri¹**: not measured. Its hotkey (Alt+Space default) could not be
  triggered from automation in this environment (injected input was blocked),
  and the launcher window is hidden at boot, so the equivalent number needs a
  physical keystroke.

## Memory profile of the native shell process

`dotnet-counters` (System.Runtime) against the idle process after a
summon/hide cycle: GC heap ≈ 10 MB (LOH and POH both 0, zero GC activity per
second at idle); total working set ≈ 168 MB, of which only ~72 MB is private.
Conclusion: the private working set is dominated by **native/WPF**
(PresentationFramework, wpfgfx, DWM, font and GDI allocations), not the
managed heap. `ConcurrentGarbageCollection=false` + `GCConserveMemory=9` were
tested and **rejected**: idle private WS 72.2 vs 72.0 MB (no measurable
benefit) with cold open possibly worse (123 ms vs 82 ms). No
`EmptyWorkingSet`/trim-on-hide was used, per the ground rules.

## Other caveats

- The Tauri row is the **best case** (main window only). The realistic Tauri
  footprint with all four boot windows pre-created was **307.5 MB** private WS
  (Phase-0 investigation, same machine and method).
- The native shell currently renders one window; search results come from the
  sidecar over stdio. The emoji catalog is gemoji v4.1.0 (MIT).
- Profiles are fresh/empty for both rows; a real user profile adds to the
  Tauri app process (clipboard history, indexes) but not measurably to the
  native shell yet.
