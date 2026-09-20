// asyar-launcher/src/lib/ipc/islandCommands.ts
// Tauri command wrappers for the Dynamic Island window, re-exported through
// ./commands (the barrel).
import { invokeSafe } from './invokeSafe';

export interface IslandContent {
  /** Emoji/glyph text, or an image URL (http/https/data) for album art. */
  icon: string | null;
  title: string;
  subtitle: string | null;
  /** Score layout: right-side crest (icon is the left crest). */
  awayIcon: string | null;
  /** Score layout: centered text (minute, HT, PEN, …). */
  centerText: string | null;
  waveform: boolean;
  /** Monotonic reveal generation; echo back via islandMarkShown after the
   * content has painted to complete the flash-free reveal (macOS shows
   * the island window at alpha 0 until then). */
  revealGen: number;
}

export async function getIslandState(): Promise<IslandContent | null> {
  return invokeSafe<IslandContent | null>('get_island_state');
}

/** Tells Rust the island content for `revealGen` is painted, so the window's
 * alpha can flip to 1. Safe to call redundantly; stale generations are
 * dropped Rust-side. No-op on non-macOS. */
export async function islandMarkShown(revealGen: number): Promise<void> {
  await invokeSafe('island_mark_shown', { revealGen });
}

export interface ShowIslandOptions {
  /** Optional leading icon: an emoji/glyph, or an image URL (album art). */
  icon?: string;
  title: string;
  /** Optional dimmed secondary line under the title. */
  subtitle?: string;
  /** Score layout: right-side crest (icon is the left crest). */
  awayIcon?: string;
  /** Score layout: centered text (minute, HT, PEN, …). */
  centerText?: string;
  /** Render the animated audio-waveform after the title. */
  waveform?: boolean;
  /** Stay visible until `hideIsland()` or a follow-up non-pinned show.
   * Host flows never set this — it exists for persistent indicators. */
  pinned?: boolean;
  /** Auto-hide delay in milliseconds. Defaults to ~2s. */
  durationMs?: number;
}

export async function showIsland(args: ShowIslandOptions): Promise<void> {
  // The Rust command takes one `content` struct plus a separate duration —
  // matches `commands/island.rs::show_island`.
  await invokeSafe('show_island', {
    content: {
      icon: args.icon ?? null,
      title: args.title,
      subtitle: args.subtitle ?? null,
      waveform: args.waveform ?? false,
      pinned: args.pinned ?? false,
      awayIcon: args.awayIcon ?? null,
      centerText: args.centerText ?? null,
      revealGen: 0,
    },
    durationMs: args.durationMs,
  });
}

export async function hideIsland(): Promise<void> {
  await invokeSafe('hide_island');
}
