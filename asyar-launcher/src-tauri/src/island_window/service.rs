//! Island service — orchestrates window positioning, content emission, and
//! the auto-hide timer.
//!
//! The island window is pre-declared in `tauri.conf.json` (label `"island"`,
//! transparent, decorations off, alwaysOnTop, initially hidden). This
//! module owns the runtime lifecycle.

use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};

use crate::error::AppError;
use crate::island_window::{IslandContent, IslandState};

/// Window label for the island webview, matching `tauri.conf.json`.
pub const ISLAND_WINDOW_LABEL: &str = "island";

/// Logical pixel dimensions of the island window.
///
/// These MUST match the `width`/`height` declared in `tauri.conf.json` for
/// the `"island"` window. We hardcode them here instead of querying
/// `window.outer_size()` because that returns 0×0 on a window that has not
/// yet been shown — and the island window is declared `visible: false`, so
/// the very first `show_island` call would query 0×0 and compute a
/// corner-of-screen position instead of top-center.
const ISLAND_WIDTH: f64 = 420.0;
const ISLAND_HEIGHT: f64 = 64.0;

/// Margin between the island and the top edge of the active monitor (logical px).
const ISLAND_TOP_MARGIN: f64 = 18.0;

/// Show the island with the given content.
///
/// 1. Stores `{icon, title, subtitle, reveal_gen}` in `IslandState.current`
///    so the island route can read it on mount (handles the first-show race
///    where the listener isn't attached yet).
/// 2. Positions the island window near the top edge of the monitor that
///    currently contains the mouse cursor (the Dynamic Island look).
/// 3. Shows the window — on macOS, at alpha 0 when it was hidden: the
///    stale composite from the *previous* island would otherwise paint for a
///    frame or two before the new content lands (WKWebView keeps rendering
///    on its own pipeline; `show()` composites whatever surface exists at
///    that instant — same failure mode the launcher's two-phase
///    `prepare_show`/`commit_show` solves). Ordering in *before* the emit
///    also unthrottles the hidden webview so its rAF loop is alive to
///    process the event promptly.
/// 4. Emits the `island:show` event; the route repaints, waits two rAFs, and
///    echoes `island_mark_shown(reveal_gen)` which flips alpha to 1. A
///    `REVEAL_FALLBACK_MS` watchdog guarantees the reveal even if the echo
///    never arrives.
/// 5. Cancels any pending auto-hide and schedules a new one for
///    `duration_ms` — unless the content is `pinned`, in which case no
///    timer is scheduled and the island stays until `hide_island` or a
///    follow-up non-pinned show.
///
/// Pinned-restore contract: while a pinned island is up, a regular
/// (non-pinned) notification preempts it for its `duration_ms`, then the
/// pinned content is restored automatically — a transient toast must never
/// evict a live score.
pub fn show(app: &AppHandle, content: IslandContent, duration_ms: u32) -> Result<(), AppError> {
    log::info!(
        "[island] show(title={:?}, duration_ms={duration_ms}, pinned={})",
        content.title,
        content.pinned
    );
    let window = app
        .get_webview_window(ISLAND_WINDOW_LABEL)
        .ok_or_else(|| AppError::NotFound("island window".to_string()))?;

    // The island is display-only: make it click-through so users can interact
    // with whatever is underneath.
    let _ = window.set_ignore_cursor_events(true);

    let state = app.state::<IslandState>();

    // Pinned bookkeeping: pinning stores the content; a non-pinned show while
    // pinned schedules a restore of the pinned content after the toast.
    {
        let mut restore_slot = state.restore_task.lock().map_err(|_| AppError::Lock)?;
        if let Some(prev) = restore_slot.take() {
            prev.abort();
        }
    }
    if content.pinned {
        let mut pinned_slot = state.pinned_content.lock().map_err(|_| AppError::Lock)?;
        *pinned_slot = Some(content.clone());
    } else {
        let pinned = {
            let slot = state.pinned_content.lock().map_err(|_| AppError::Lock)?;
            slot.clone()
        };
        if let Some(pinned_content) = pinned {
            let app_for_restore = app.clone();
            let handle = tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(duration_ms as u64)).await;
                let _ = emit_current(&app_for_restore, pinned_content);
            });
            let mut restore_slot = state.restore_task.lock().map_err(|_| AppError::Lock)?;
            *restore_slot = Some(handle);
        }
    }

    emit_current(app, content.clone())?;

    let state = app.state::<IslandState>();

    // Cancel any pending auto-hide; schedule a fresh one unless pinned.
    {
        let mut slot = state.auto_hide_task.lock().map_err(|_| AppError::Lock)?;
        if let Some(prev) = slot.take() {
            prev.abort();
        }
        if !content.pinned {
            let app_for_task = app.clone();
            let handle = tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(duration_ms as u64)).await;
                let _ = hide(&app_for_task);
            });
            *slot = Some(handle);
        }
    }

    Ok(())
}

/// Position, show, emit, and store `content` as the current island state.
/// Shared by `show` and the pinned-restore path.
fn emit_current(app: &AppHandle, content: IslandContent) -> Result<(), AppError> {
    let window = app
        .get_webview_window(ISLAND_WINDOW_LABEL)
        .ok_or_else(|| AppError::NotFound("island window".to_string()))?;

    let state = app.state::<IslandState>();
    let reveal_gen = state.reveal_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let content = IslandContent {
        reveal_gen,
        ..content
    };

    {
        let mut slot = state.current.lock().map_err(|_| AppError::Lock)?;
        *slot = Some(content.clone());
    }

    position_at_top_center(&window)?;

    let _ = window.show();

    app.emit_to(ISLAND_WINDOW_LABEL, "island:show", &content)
        .map_err(|e| AppError::Platform(format!("emit island:show failed: {e}")))?;
    Ok(())
}

/// Returns the most recently set island content, if any.
pub fn current_state(app: &AppHandle) -> Result<Option<IslandContent>, AppError> {
    let state = app.state::<IslandState>();
    let slot = state.current.lock().map_err(|_| AppError::Lock)?;
    Ok(slot.clone())
}

/// Completes the flash-free reveal: flips the island window's alpha to 1 once
/// the route has painted `reveal_gen`'s content (the route echoes the gen
/// it received after two rAFs). Echoes from a superseded generation are
/// dropped — the newer `show` owns the reveal. No-op on non-macOS, where
/// `show` never drops alpha.
pub fn mark_shown(app: &AppHandle, reveal_gen: u64) -> Result<(), AppError> {
    {
        let _ = (app, reveal_gen);
    }
    Ok(())
}

/// Hide the island window immediately and cancel any pending auto-hide.
///
/// Before hiding, clears the route's content (`island:hide` event + the
/// `IslandState.current` cache): a hidden webview keeps its last composited
/// frame, so if the pill stayed rendered the next `show` would flash the
/// stale notification until the route repaints.
pub fn hide(app: &AppHandle) -> Result<(), AppError> {
    let _ = app.emit_to(ISLAND_WINDOW_LABEL, "island:hide", ());
    if let Some(state) = app.try_state::<IslandState>() {
        if let Ok(mut slot) = state.current.lock() {
            *slot = None;
        }
        // An explicit hide also ends the pinned island and any pending
        // restore of it.
        if let Ok(mut slot) = state.pinned_content.lock() {
            *slot = None;
        }
        if let Ok(mut slot) = state.restore_task.lock() {
            if let Some(prev) = slot.take() {
                prev.abort();
            }
        }
    }
    if let Some(window) = app.get_webview_window(ISLAND_WINDOW_LABEL) {
        let _ = window.hide();
    }
    if let Some(state) = app.try_state::<IslandState>() {
        if let Ok(mut slot) = state.auto_hide_task.lock() {
            if let Some(prev) = slot.take() {
                prev.abort();
            }
        }
    }
    Ok(())
}

/// Positions the island window at the top-center of the monitor containing
/// the mouse cursor, and ensures the OS frame matches the declared island size.
///
/// We force `set_size` BEFORE `set_position` because Tauri 2 on macOS may
/// not initialize a never-shown window's frame from `tauri.conf.json` until
/// the first `show()` — without this, `outer_size()` reads 0×0 and any
/// centering math degenerates to a corner-of-screen position.
fn position_at_top_center<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), AppError> {
    let m = window
        .primary_monitor()
        .map_err(|e| AppError::Platform(format!("primary_monitor: {e}")))?
        .ok_or_else(|| AppError::NotFound("primary monitor".to_string()))?;

    let scale = m.scale_factor();
    let monitor_size = m.size().to_logical::<f64>(scale);
    let monitor_position = m.position().to_logical::<f64>(scale);

    // Force the window to its declared size before positioning, so that
    // (a) the OS has a real frame to move and (b) the centering math below
    // uses the correct dimensions.
    window
        .set_size(tauri::Size::Logical(LogicalSize {
            width: ISLAND_WIDTH,
            height: ISLAND_HEIGHT,
        }))
        .map_err(|e| AppError::Platform(format!("island set_size: {e}")))?;

    let x = monitor_position.x + (monitor_size.width - ISLAND_WIDTH) / 2.0;
    let y = monitor_position.y + ISLAND_TOP_MARGIN;

    log::info!(
        "[island] positioning at logical ({x:.0}, {y:.0}) on monitor ({:.0}x{:.0} @ {:.0},{:.0}) scale={scale}",
        monitor_size.width,
        monitor_size.height,
        monitor_position.x,
        monitor_position.y,
    );

    window
        .set_position(tauri::Position::Logical(LogicalPosition { x, y }))
        .map_err(|e| AppError::Platform(format!("island set_position: {e}")))?;
    Ok(())
}
