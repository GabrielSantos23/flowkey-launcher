/** Options for showing the Dynamic Island notification pill. */
export interface IslandShowOptions {
  /** Optional leading icon: an emoji/glyph, or an image URL (rendered as
   * rounded album art). */
  icon?: string;
  /** Render the animated audio-waveform after the title (now-playing look). */
  waveform?: boolean;
  /** Stay visible until `dismiss()` (or a follow-up non-pinned show) instead
   * of auto-hiding. Use for persistent indicators (recording in progress,
   * sync running, …); always pair with a `dismiss()` when the condition ends. */
  pinned?: boolean;
  /** Score layout: with `awayIcon` set, `icon` and `awayIcon` render as
   * crests at the pill's outer edges with `title` (e.g. the home score) and
   * `subtitle` (the away score) between them and `centerText` in the middle. */
  awayIcon?: string;
  /** Score layout: centered text — minute, HT, PEN, … */
  centerText?: string;
  /** Primary text shown in the pill. */
  title: string;
  /** Optional dimmed secondary line under the title. */
  subtitle?: string;
  /** How long the pill stays visible, in milliseconds. Defaults to ~2000ms. */
  durationMs?: number;
}

/**
 * Host service for the Dynamic Island — the transient notification pill at
 * the top-center of the active monitor.
 *
 * Fire-and-forget: the pill appears over whatever is on screen, auto-hides
 * after `durationMs`, and rapid successive calls replace the visible content
 * (callers never need to debounce). Purely informational — it is not
 * clickable and cannot steal focus.
 */
export interface IIslandService {
  /** Show the island with the given content. Auto-hides after `durationMs`,
   * or stays until `dismiss()` when `pinned` is set. */
  show(options: IslandShowOptions): Promise<void>;

  /** Hide the island immediately — the only way to remove a pinned island. */
  dismiss(): Promise<void>;
}
