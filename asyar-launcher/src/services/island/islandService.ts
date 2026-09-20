// asyar-launcher/src/services/island/islandService.ts
//
// Host service for the Dynamic Island — the transient notification pill at
// the top-center of the active monitor. One overlay for everything: display
// switching, Spotify track changes, clipboard copies, extension events.
//
// Tier 1 built-in features call this directly; Tier 2 extensions reach the
// same surface through the SDK `IslandServiceProxy` (namespace `island`),
// registered in `buildServiceRegistry.ts`.
import * as commands from '../../lib/ipc/commands';
import type { ShowIslandOptions } from '../../lib/ipc/islandCommands';

/** Default island visibility duration. */
const DEFAULT_ISLAND_DURATION_MS = 2000;

export interface IslandShowOptions extends ShowIslandOptions {
  /** Also hide the main launcher window after the island is up. Host-only
   * semantics — extensions can never pass this. */
  dismissLauncher?: boolean;
}

class IslandService {
  /**
   * Show the island with the given content; it auto-hides after `durationMs`
   * (default 2000ms). Rapid successive calls replace the visible content and
   * restart the timer — callers never need to debounce.
   *
   * `dismissLauncher: true` also hides the main launcher window after the
   * island is up, for flows triggered from the launcher whose result is the
   * island itself (display switching, uninstaller, etc.). Extensions can
   * never pass this — it is host-call-only semantics.
   */
  async show(options: IslandShowOptions): Promise<void> {
    // Show the island window first (Rust positions it, renders the content,
    // schedules auto-hide), then optionally hide the main launcher window.
    // The island lives in its own Tauri window, so it survives the hide.
    await commands.showIsland({
      icon: options.icon,
      title: options.title,
      subtitle: options.subtitle,
      waveform: options.waveform,
      pinned: options.pinned,
      awayIcon: options.awayIcon,
      centerText: options.centerText,
      durationMs: options.durationMs ?? DEFAULT_ISLAND_DURATION_MS,
    });
    if (options.dismissLauncher) {
      try {
        await commands.hideWindow();
      } catch {
        // hideWindow can fail if called from a context where the main window
        // is already hidden (e.g. settings window). The island still shows.
      }
    }
  }

  /** Hide the island immediately. */
  async hide(): Promise<void> {
    await commands.hideIsland();
  }
}

export const islandService = new IslandService();
