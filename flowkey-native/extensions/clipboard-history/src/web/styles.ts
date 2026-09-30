/**
 * Clipboard history styles. Bundled as a module so the WebView2 page gets
 * them without a separate css asset (the IIFE web build cannot emit/link an
 * extra .css file). Everything keys off the shell's --fk-* theme variables.
 */

export const css = `
html, body { margin: 0; padding: 0; background: transparent; }
body {
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif;
  color: var(--fk-text-primary, #fff);
  overflow: hidden;
}
[hidden] { display: none !important; }

.cl-app {
  display: flex;
  /* the viewport ends right at the footer, so the bottom border sits on
     top of it */
  height: 100vh;
  color-scheme: dark;
  border-bottom: 1px solid var(--fk-divider, #363636);
}

/* ---- entries list ---------------------------------------------------- */

.cl-list {
  width: 300px;
  flex: none;
  overflow-y: auto;
  padding: 4px 8px 8px;
  border-right: 1px solid var(--fk-divider, #363636);
}
.cl-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fk-text-secondary, #a6a6a6);
  margin: 12px 6px 4px;
}
.cl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  margin: 1px 0;
  border-radius: 10px;
  cursor: pointer;
  min-height: 24px;
}
.cl-row:hover { background: var(--fk-row-selected-background, #363636); }
.cl-row-selected { background: var(--fk-row-selected-background, #363636); }
.cl-row-icon {
  width: 28px;
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--fk-surface, #262626);
  color: var(--fk-text-secondary, #a6a6a6);
  overflow: hidden;
}
.cl-row-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cl-row-swatch { width: 14px; height: 14px; border-radius: 3px; }
.cl-row-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cl-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--fk-text-secondary, #a6a6a6);
}
.cl-empty-title { font-size: 14px; margin-bottom: 6px; }
.cl-empty-description { font-size: 13px; color: var(--fk-text-tertiary, #797979); }

/* ---- detail pane ------------------------------------------------------ */
/* static: fits the viewport, nothing scrolls or gets cut off. The preview
   dominates (Raycast-style); Information is compact below it. */

.cl-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 12px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cl-preview {
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid var(--fk-divider, #363636);
  border-radius: 12px;
  background: var(--fk-surface, #262626);
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cl-preview img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; display: block; }
.cl-preview-text {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fk-text-primary, #fff);
}
.cl-preview-files { margin: 0; padding: 0; list-style: none; width: 100%; }
.cl-preview-files li {
  font-size: 13px;
  padding: 3px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cl-color-swatch {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: flex-end;
  padding: 12px;
}
.cl-color-light { border-color: rgba(0, 0, 0, 0.18); }
.cl-color-hex {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}
.cl-color-light .cl-color-hex { color: rgba(0, 0, 0, 0.75); text-shadow: none; }
.cl-info-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--fk-text-secondary, #a6a6a6);
  flex: none;
}
.cl-info { border-top: 1px solid var(--fk-divider, #363636); flex: none; }
.cl-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 5px 2px;
  border-bottom: 1px solid var(--fk-divider, #363636);
  font-size: 12px;
}
.cl-info-label { color: var(--fk-text-secondary, #a6a6a6); flex: none; }
.cl-info-value {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  justify-content: flex-end;
  text-align: right;
}
.cl-info-value img { width: 16px; height: 16px; border-radius: 4px; display: block; }
.cl-info-value span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
