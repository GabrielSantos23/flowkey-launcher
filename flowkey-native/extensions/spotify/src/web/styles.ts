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
  scrollbar-color: var(--fk-row-selected-background, #363636) transparent;
}
body {
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif;
  font-size: 13px;
  background: var(--fk-window-background, #1f1f1f);
  color: var(--fk-text-primary, #fff);
  overflow: hidden;
  user-select: none;
}
#root { height: 100vh; }

.sp-app { display: flex; flex-direction: column; height: 100vh; }

.sp-content { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--fk-row-selected-background, #363636); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--fk-text-tertiary, #797979); }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-corner { background: transparent; }

.sp-section-title {
  font-size: 12px; font-weight: 600;
  color: var(--fk-text-secondary, #a6a6a6);
  margin: 12px 2px 6px;
}
.sp-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  min-height: 40px;
}
.sp-row:hover { background: var(--fk-row-selected-background, #363636); }
.sp-row-selected { background: var(--fk-row-selected-background, #363636); }
.sp-art {
  width: 28px; height: 28px; flex: none;
  border-radius: 4px;
  object-fit: cover;
  background: var(--fk-surface, #262626);
}
.sp-art-circle { border-radius: 50%; }
.sp-art-lg { width: 36px; height: 36px; border-radius: 6px; }
.sp-art-fallback {
  display: flex; align-items: center; justify-content: center;
  color: var(--fk-text-tertiary, #797979);
}
.sp-row-main { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.sp-row-title {
  font-size: 13px; font-weight: 500;
  color: var(--fk-text-primary, #fff);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sp-row-subtitle {
  font-size: 12px;
  color: var(--fk-text-secondary, #a6a6a6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: none; max-width: 55%;
}
.sp-row-duration { font-size: 12px; color: var(--fk-text-secondary, #a6a6a6); flex: none; }

.sp-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.sp-cell {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: var(--fk-surface, #262626);
  cursor: pointer;
  border: 2px solid transparent;
}
.sp-cell:hover { background: var(--fk-row-selected-background, #363636); }
.sp-cell-selected { border-color: var(--fk-text-primary, #fff); }
.sp-cell-art {
  width: 100%; aspect-ratio: 1;
  border-radius: 6px;
  object-fit: cover;
  background: var(--fk-surface-alt, #161616);
}
.sp-cell-circle { border-radius: 50%; }
.sp-cell-title {
  font-size: 13px; font-weight: 500; color: var(--fk-text-primary, #fff);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sp-cell-subtitle {
  font-size: 11px; color: var(--fk-text-secondary, #a6a6a6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.sp-empty {
  height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px;
  text-align: center;
  color: var(--fk-text-secondary, #a6a6a6);
  padding: 24px;
}
.sp-empty-title { font-size: 14px; font-weight: 600; color: var(--fk-text-primary, #fff); }
.sp-empty-description { font-size: 13px; max-width: 420px; }

.sp-detail {
  display: flex; gap: 20px;
  padding: 14px 16px;
  height: 100%;
  min-height: 0;
}
.sp-detail-main { flex: 1.1; min-width: 0; display: flex; flex-direction: column; }
.sp-detail-title {
  font-size: 21px; font-weight: 700; line-height: 1.25;
  color: var(--fk-text-primary, #fff);
}
.sp-detail-subtitle { font-size: 14px; color: var(--fk-text-secondary, #a6a6a6); margin-top: 4px; }
.sp-detail-art {
  margin-top: auto;
  width: min(200px, 60%);
  aspect-ratio: 1;
  border-radius: 8px;
  object-fit: cover;
  background: var(--fk-surface, #262626);
  align-self: center;
}
.sp-detail-art-fallback {
  margin-top: auto;
  width: min(200px, 60%);
  aspect-ratio: 1;
  border-radius: 8px;
  background: var(--fk-surface, #262626);
  align-self: center;
  display: flex; align-items: center; justify-content: center;
  color: var(--fk-text-tertiary, #797979);
}
.sp-detail-meta {
  flex: 1; min-width: 0;
  border-left: 1px solid var(--fk-divider, #363636);
  padding: 4px 0 4px 18px;
  overflow-y: auto;
}
.sp-meta-label { font-size: 12px; color: var(--fk-text-secondary, #a6a6a6); margin: 10px 0 2px; }
.sp-meta-value { font-size: 13px; color: var(--fk-text-primary, #fff); display: flex; align-items: center; gap: 6px; }
.sp-progress { margin-top: 14px; }
.sp-progress-times {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--fk-text-secondary, #a6a6a6);
  margin-top: 4px;
}
.sp-progress-track {
  height: 4px; border-radius: 2px;
  background: var(--fk-row-selected-background, #363636);
  cursor: pointer;
}
.sp-progress-fill {
  height: 100%; border-radius: 2px;
  background: #1db954;
  pointer-events: none;
}
.sp-transport { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.sp-tbtn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border-radius: 6px;
  border: none; background: transparent;
  color: var(--fk-text-secondary, #a6a6a6);
  cursor: pointer;
}
.sp-tbtn:hover { background: var(--fk-row-selected-background, #363636); color: var(--fk-text-primary, #fff); }
.sp-tbtn-active { color: #1db954; }
.sp-tbtn-play {
  width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid var(--fk-divider, #363636);
  background: var(--fk-surface, #262626);
  color: var(--fk-text-primary, #fff);
}
.sp-volume { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.sp-volume-track {
  width: 70px; height: 4px; border-radius: 2px;
  background: var(--fk-row-selected-background, #363636);
}

.sp-badge {
  width: 18px; height: 18px; border-radius: 50%;
  background: #1db954;
  display: flex; align-items: center; justify-content: center;
  flex: none;
}

.sp-connect {
  height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center; padding: 24px;
}
.sp-connect-title { font-size: 16px; font-weight: 700; color: var(--fk-text-primary, #fff); }
.sp-connect-description { font-size: 13px; color: var(--fk-text-secondary, #a6a6a6); max-width: 440px; }
.sp-connect-button {
  margin-top: 6px;
  display: flex; align-items: center; gap: 8px;
  background: #1db954; color: #fff;
  border: none; border-radius: 8px;
  font: inherit; font-size: 13px; font-weight: 600;
  padding: 8px 18px;
  cursor: pointer;
}
.sp-connect-button:hover { background: #1ed760; }
.sp-connect-button:disabled { opacity: 0.6; cursor: default; }

.sp-notice {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--fk-text-secondary, #a6a6a6);
  background: var(--fk-surface-alt, #161616);
  border-bottom: 1px solid var(--fk-divider, #363636);
}
.sp-notice-error { color: var(--fk-danger, #ef4444); }
.sp-lyrics {
  height: 100%; overflow-y: auto;
  padding: calc(50vh - 80px) 24px calc(50vh - 40px);
  scroll-behavior: smooth;
}
.sp-lyrics-line {
  font-size: 16px; line-height: 1.8;
  color: var(--fk-text-tertiary, #797979);
  white-space: pre-wrap;
  padding: 8px 12px;
  border-radius: 8px;
  transition: color 0.25s ease, font-size 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
  cursor: default;
  opacity: 0.6;
}
.sp-lyrics-line-active {
  color: var(--fk-text-primary, #fff);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.5;
  opacity: 1;
  transform: scale(1.02);
  transform-origin: left center;
  scroll-margin-top: calc(50vh - 60px);
}
.sp-lyrics-line-past {
  color: var(--fk-text-secondary, #a6a6a6);
  opacity: 0.45;
}
.sp-lyrics-header { margin-bottom: 24px; padding: 0 12px; }
.sp-lyrics-title { font-size: 18px; font-weight: 700; color: var(--fk-text-primary, #fff); }
.sp-lyrics-subtitle { font-size: 13px; color: var(--fk-text-secondary, #a6a6a6); margin-top: 4px; }
.sp-lyrics-hint { font-size: 11px; color: var(--fk-text-tertiary, #797979); margin-top: 6px; }
.sp-lyrics-hint-paused { color: var(--fk-text-secondary, #a6a6a6); }
`;
