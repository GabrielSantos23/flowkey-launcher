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

.gt-app { display: flex; flex-direction: column; height: 100vh; }
.gt-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 3px 7px 0;
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--fk-row-selected-background, #383838); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--fk-text-tertiary, #797979); }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-corner { background: transparent; }

/* result rows */
.gt-row {
  display: flex; align-items: center; gap: 12px;
  min-height: 42px; padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
}
.gt-row-selected { background: var(--fk-row-selected-background, #383838); }
.gt-row-text {
  flex: 1; min-width: 0;
  font-size: 14px; font-weight: 500;
  color: var(--fk-text-primary, #f0f0f0);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gt-row-subtitle {
  flex: none; max-width: 52%;
  font-size: 13px;
  color: var(--fk-text-secondary, #a0a0a0);
  text-align: right;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gt-row-muted .gt-row-text { font-weight: 400; color: var(--fk-text-secondary, #a0a0a0); }
.gt-row-error .gt-row-text { color: #f0a0a0; }

/* status */
.gt-status {
  display: flex; align-items: center; gap: 8px;
  min-height: 22px; padding: 0 8px;
  font-size: 12px;
  color: var(--fk-text-tertiary, #8c8c8c);
}
.gt-status-error { color: #e08a8a; }
.gt-spinner {
  width: 11px; height: 11px; flex: none;
  border-radius: 50%;
  border: 2px solid var(--fk-divider, #353535);
  border-top-color: var(--fk-text-secondary, #a0a0a0);
  animation: gt-spin .7s linear infinite;
}
@keyframes gt-spin { to { transform: rotate(360deg); } }

/* empty states */
.gt-empty {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px;
  text-align: center;
  color: var(--fk-text-secondary, #a0a0a0);
  padding: 24px;
}
.gt-empty-title { font-size: 14px; font-weight: 600; color: var(--fk-text-primary, #f0f0f0); }
.gt-empty-description { font-size: 13px; max-width: 420px; line-height: 1.5; }
.gt-empty-error .gt-empty-title { color: #f0a0a0; }
`;
