//! Island Tauri command wrappers — thin shells over `crate::island_window::service`.

use tauri::AppHandle;

use crate::error::AppError;
use crate::island_window::{service, IslandContent};

/// Show the island with the given content; auto-hides after `duration_ms`.
#[tauri::command]
pub fn show_island(
    app_handle: AppHandle,
    content: IslandContent,
    duration_ms: u32,
) -> Result<(), AppError> {
    service::show(&app_handle, content, duration_ms)
}

/// Hide the island immediately.
#[tauri::command]
pub fn hide_island(app_handle: AppHandle) -> Result<(), AppError> {
    service::hide(&app_handle)
}

/// Invoked by the island route two rAFs after painting the content of
/// `reveal_gen` — completes the flash-free reveal `show_island` started at
/// alpha 0. Safe to call redundantly; stale generations are dropped.
#[tauri::command]
pub fn island_mark_shown(app_handle: AppHandle, reveal_gen: u64) -> Result<(), AppError> {
    service::mark_shown(&app_handle, reveal_gen)
}

/// Returns the most recently set island content (or `null` if none).
///
/// The island's route calls this on mount to recover the state that
/// was emitted before its event listener attached. Without this fallback,
/// the very first `show_island` call would render an empty pill because the
/// `island:show` event fires before the lazy-loaded webview mounts.
#[tauri::command]
pub fn get_island_state(app_handle: AppHandle) -> Result<Option<IslandContent>, AppError> {
    service::current_state(&app_handle)
}
