# Shell comparison — Tauri (WebView2) vs native C# WPF shell

Measured with `scripts/measure-idle.ps1` (private working set, Task Manager
method, summed over the app process, its `msedgewebview2.exe` descendants and
the sidecar). Idle = window hidden, no interaction, 5 minutes. Open time =
hotkey press → window visible. All numbers from **Release** builds on the
same machine.

| shell  | idle RAM (window hidden, 5 min): shell-only / sidecar / total | cold open (hotkey) | warm open (hotkey) |
| ------ | ------------------------------------------------------------- | ------------------ | ------------------ |
| tauri  | _to be filled at phase end_                                   | _to be filled_     | _to be filled_     |
| native | _to be filled at phase end_                                   | _to be filled_     | _to be filled_     |

## Notes

- The sidecar is included in both rows; it is the same bun process running the
  same extensions, so the shell-only column is the fair comparison.
- Prior context measurements (Phase-0 investigation, fresh profile,
  `org.asyar.dev` release build, private working set): all four boot windows
  pre-created: **307.5 MB** total (80.0 app + 227.5 WebView2 group); main
  window only: **197.9 MB**. These are context, not the final table numbers —
  the table is filled from the protocol above at each phase end.
