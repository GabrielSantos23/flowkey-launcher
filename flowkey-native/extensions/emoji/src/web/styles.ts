// Bundled as a module so the WebView2 page gets styles without a separate css
// file (the IIFE web build cannot emit/link an extra .css asset). Themed via
// the --fk-* custom properties the shell injects into the host page.
export const css = `
* { box-sizing: border-box; }
html, body {
  margin: 0;
  height: 100%;
  color-scheme: dark;
}
* {
  scrollbar-width: thin;
  scrollbar-color: var(--fk-row-selected-background, #383838) transparent;
}
body {
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif;
  font-size: 14px;
  background: var(--fk-window-background, #1f1f1f);
  color: var(--fk-text-primary, #f0f0f0);
  overflow: hidden;
  user-select: none;
}
#root { height: 100vh; }

.em-app { display: flex; flex-direction: column; height: 100vh; }
.em-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 2px 15px 14px;
  outline: none;
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--fk-row-selected-background, #383838); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--fk-text-tertiary, #797979); }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-corner { background: transparent; }

/* sections */
.em-section { margin-top: 14px; }
.em-section:first-child { margin-top: 4px; }
.em-section-header {
  display: flex; align-items: baseline; gap: 7px;
  padding: 0 2px 8px;
}
.em-section-title {
  font-size: 13px; font-weight: 600;
  color: var(--fk-text-primary, #f0f0f0);
}
.em-section-count {
  font-size: 12px; font-weight: 500;
  color: var(--fk-text-tertiary, #8b9bb4);
}

/* the eight-column tile grid */
.em-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
}
.em-tile {
  position: relative;
  aspect-ratio: 1 / 1;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  background: var(--fk-surface, #292929);
  cursor: pointer;
}
.em-tile:hover { background: var(--fk-row-selected-background, #383838); }
.em-tile-emoji {
  font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  font-size: 40px;
  line-height: 1;
  /* the picker is a preview, not a text field */
  user-select: none;
}
/* the selection ring: a warm outline on the tile fill, no fill change */
.em-tile-selected {
  background: var(--fk-surface, #292929);
  box-shadow: inset 0 0 0 2px #f0e4cd;
}
.em-tile-selected:hover { background: var(--fk-surface, #292929); }
/* the pin: a quiet corner mark on emoji that lead the Frequently Used list */
.em-tile-pin {
  position: absolute; top: 6px; right: 6px;
  display: flex;
  color: var(--fk-text-tertiary, #8b9bb4);
  opacity: .75;
}

/* empty state */
.em-empty {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px;
  text-align: center;
  color: var(--fk-text-secondary, #a0a0a0);
  padding: 24px;
}
.em-empty-title { font-size: 14px; font-weight: 600; color: var(--fk-text-primary, #f0f0f0); }
.em-empty-description { font-size: 13px; max-width: 420px; line-height: 1.5; }

/* transient status line (copy confirmation, pin confirmation, paste failure) */
.em-status {
  flex: none;
  padding: 8px 2px 0;
  font-size: 12px;
  color: var(--fk-text-tertiary, #8c8c8c);
}
.em-status-error { color: #e08a8a; }

/* the one-time hint that teaches the pin action */
.em-hint {
  flex: none;
  padding: 8px 2px 0;
  font-size: 12px;
  color: var(--fk-text-tertiary, #8c8c8c);
  opacity: .8;
}

/* action palette */
.em-palette-backdrop {
  position: fixed; inset: 0;
  display: flex; align-items: flex-end; justify-content: flex-end;
  padding: 0 12px 12px;
  background: transparent;
}
.em-palette {
  width: 340px; max-height: 300px;
  display: flex; flex-direction: column;
  background: var(--fk-surface-alt, #242424);
  border: 1px solid var(--fk-divider, #3a3a3a);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .45);
}
.em-palette-search {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--fk-divider, #353535);
  color: var(--fk-text-secondary, #a0a0a0);
}
.em-palette-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--fk-text-primary, #f0f0f0); font: inherit; font-size: 13px;
}
.em-palette-search input::placeholder { color: var(--fk-text-tertiary, #797979); }
.em-palette-rows { overflow-y: auto; padding: 4px; }
.em-palette-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}
.em-palette-row:hover { background: var(--fk-row-selected-background, #383838); }
.em-palette-row-selected { background: var(--fk-row-selected-background, #383838); }
.em-palette-row-icon { display: flex; color: var(--fk-text-secondary, #a0a0a0); flex: none; }
.em-palette-row-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.em-palette-empty { padding: 14px; color: var(--fk-text-tertiary, #797979); text-align: center; }
`;
