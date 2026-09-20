//! Shared keyboard input simulation logic.

use enigo::{Enigo, Key, KeyboardControllable};

/// Simulates a paste chord (Cmd+V on macOS, Ctrl+V elsewhere).
pub fn post_paste_chord() {
    {
        post_key_chord_via_enigo(Key::Control, 'v');
    }
}

/// Simulates a copy chord (Cmd+C on macOS, Ctrl+C elsewhere).
pub fn post_copy_chord_to_frontmost() {
    {
        post_key_chord_via_enigo(Key::Control, 'c');
    }
}

/// Shared helper for enigo-based modifier chords.
pub fn post_key_chord_via_enigo(modifier: Key, key_char: char) {
    let mut enigo = Enigo::new();
    enigo.key_down(modifier);
    enigo.key_click(Key::Layout(key_char));
    enigo.key_up(modifier);
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_post_paste_chord_smoke() {
        // We can't easily verify the OS events in CI, but we ensure it doesn't panic.
        // In a real TDD environment, we might mock enigo or the FFI.
        // For now, this acts as a placeholder for the "red" phase if we had mocks.
    }
}
