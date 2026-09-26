# Keyboard Shortcuts & Input Safety

## 1. Preserve Native Text Editing Shortcuts

- In any view with an active search box or editable text field, **never hijack standard OS text editing shortcuts**:
  - `Ctrl + Backspace` / `Ctrl + Delete`: Deletes previous/next word. **NEVER bind to delete/trash item**.
  - `Ctrl + A`, `Ctrl + C`, `Ctrl + V`, `Ctrl + X`, `Ctrl + Z`: Standard clipboard and undo operations.
- The search box is the primary interaction point; user expectations for text editing take precedence over list-level actions.

## 2. Destructive Actions & Item Deletion

- **Action Panel First**: Destructive item operations (Delete, Move to Trash, Uninstall, Clear) belong in the **`Ctrl+K` Action Panel** with confirmations where applicable.
- **No `Ctrl+Del` for Item Deletion**: Do not assign `Ctrl+Backspace` or `Delete` as a direct shortcut for deleting list items, history entries, or files.
- If a direct shortcut is ever required for item deletion, use non-conflicting chords that do not interfere with typing in the search box.

## 3. Empty-Input Guarding for Navigation

- Shortcuts that repurpose keys like `Backspace`, `Delete`, or `Escape` for navigation (going back, closing a view):
  - Must verify that the search query is strictly empty.
  - Must defer to any focused text input.

## 4. Platform Neutrality

- FlowKey is Windows-only: shortcuts are documented with `Ctrl` / `Alt` / `Win`, never `⌘`.
