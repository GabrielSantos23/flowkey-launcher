//! Dynamic Island — a small transient window pinned to the top-center of the
//! active monitor that shows a brief notification pill (icon + title, optional
//! subtitle).
//!
//! The island lives in its own Tauri webview window (label `"island"`), which
//! is pre-declared in `tauri.conf.json` with `visible: false`. Callers request
//! it via the `show_island` command; this module positions the window, emits
//! the content to the island's route via the `island:show` event, shows the
//! window, and schedules an auto-hide.
//!
//! Tier 1 built-in features invoke this through the host `islandService`;
//! Tier 2 sandboxed extensions go through the SDK `IslandServiceProxy.show()`
//! which routes `ExtensionIpcRouter` → host service registry → `show_island`
//! (TS wrapper) → `show_island` (Rust command) → here.

pub mod service;

use std::sync::atomic::AtomicU64;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::async_runtime::JoinHandle;

/// Latest state of the island window. Held by `IslandState.current` so the
/// island's route can fetch it on mount via `get_island_state` (the
/// lazy-loaded island route may attach its `island:show` listener after the
/// first emit).
///
/// Deliberately **not** `specta::Type` — like [`crate::snap_guides`], this
/// type never crosses the generated-bindings boundary; the frontend wrapper
/// lives hand-written in `src/lib/ipc/islandCommands.ts`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandContent {
    /// Optional leading icon (emoji or short glyph) rendered before the title.
    pub icon: Option<String>,
    pub title: String,
    /// Optional dimmed secondary line under the title.
    pub subtitle: Option<String>,
    /// When set, the route renders the "score layout": [`IslandContent::icon`]
    /// and this field as crests at the pill's outer edges, with the title and
    /// [`IslandContent::center_text`] between them.
    #[serde(default)]
    pub away_icon: Option<String>,
    /// Optional centered text for the score layout (minute, HT, PEN, …).
    #[serde(default)]
    pub center_text: Option<String>,
    /// When true, the route renders an animated audio-waveform after the
    /// title (the "now playing" look).
    #[serde(default)]
    pub waveform: bool,
    /// When true, the island stays visible until an explicit `hide_island`
    /// or a follow-up non-pinned `show_island` (which schedules its own
    /// auto-hide). Host flows never set this — it exists for extensions that
    /// need a persistent indicator.
    #[serde(default)]
    pub pinned: bool,
    /// Monotonic reveal generation this content was emitted under. The island
    /// route echoes it back through `island_mark_shown` after the content has
    /// painted; a mismatch there means a newer `show_island` superseded this
    /// one and the echo must not touch the window. See the flash-free
    /// reveal notes on `service::show`.
    #[serde(default)]
    pub reveal_gen: u64,
}

/// Tauri-managed state for the island window.
///
/// - `auto_hide_task` holds the in-flight auto-hide timer (if any) so that
///   a second `show_island` call can abort a pending hide before scheduling
///   its own.
/// - `current` holds the most recent content so the island's route can
///   recover it on mount.
/// - `reveal_gen` pairs each `service::show` with its `island_mark_shown`
///   echo so a stale echo from a superseded show can't reveal mid-dance.
#[derive(Default)]
pub struct IslandState {
    pub auto_hide_task: Mutex<Option<JoinHandle<()>>>,
    pub current: Mutex<Option<IslandContent>>,
    pub reveal_gen: AtomicU64,
    /// The pinned (persistent) island content, if any. When a regular
    /// notification arrives while a pinned island is up, the notification is
    /// shown first and this content is restored afterwards — the pinned
    /// island must never be lost to a transient toast.
    pub pinned_content: Mutex<Option<IslandContent>>,
    pub restore_task: Mutex<Option<JoinHandle<()>>>,
}
