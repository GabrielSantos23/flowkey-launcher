//! Keyboard input simulation commands.
//!
//! Provides paste simulation and keyword expansion-and-paste functionality.

use crate::error::AppError;
use enigo::{Enigo, KeyboardControllable};

/// Returns `true` when the OS-level Accessibility permission needed to simulate a
/// paste keystroke is granted. Always `true` off macOS, where no such gate exists.
///
/// The frontend checks this before writing to the clipboard: on macOS a synthetic
/// Cmd+V is silently dropped without this permission, and writing-then-failing would
/// re-add the content as a duplicate clipboard-history entry.
#[tauri::command]
pub fn check_accessibility_permission() -> bool {
    {
        true
    }
}

/// Simulates a system-level paste keystroke (Cmd+V / Ctrl+V).
#[tauri::command]
pub fn simulate_paste() {
    crate::platform::input::post_paste_chord();
}

struct ExpandGuard<'a>(&'a std::sync::atomic::AtomicBool);
impl Drop for ExpandGuard<'_> {
    fn drop(&mut self) {
        // Allow queued events to be processed before re-enabling the monitor
        std::thread::sleep(std::time::Duration::from_millis(50));
        self.0.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

/// Replaces the typed keyword (of `keyword_len` characters) with expanded text via paste.
#[tauri::command]
pub fn expand_and_paste(
    keyword_len: u32,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), AppError> {
    use std::sync::atomic::Ordering;
    // If another expansion is already in progress, skip this one
    if state.is_expanding.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let _guard = ExpandGuard(&state.is_expanding);

    let mut enigo = Enigo::new();
    for _ in 0..keyword_len {
        enigo.key_click(enigo::Key::Backspace);
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
    std::thread::sleep(std::time::Duration::from_millis(50));
    // macOS uses Cmd+V; Windows and Linux use Ctrl+V
    crate::platform::input::post_paste_chord();

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_check_accessibility_permission_true_off_macos() {
        // Off macOS there is no Accessibility gate, so paste is always permitted.
        assert!(super::check_accessibility_permission());
    }
}
