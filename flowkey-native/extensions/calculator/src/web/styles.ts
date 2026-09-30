export const css = `
.calc-app {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--fk-window-background, transparent);
  color: var(--fk-text-primary, inherit);
  font-family: Inter, 'Segoe UI Variable', 'Segoe UI', sans-serif;
}
.calc-app * { box-sizing: border-box; }

.calc-scroll { flex: 1; overflow-y: auto; padding: 10px 14px; }

.calc-section-label {
  color: var(--fk-text-secondary, #9a9a9a);
  font-size: 12.5px;
  font-weight: 600;
  margin: 2px 0 8px;
}

/* The card: expression → answer, centered like the Raycast calculator. */
.calc-card {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: var(--fk-surface, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--fk-divider, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 26px 30px;
}
.calc-expression {
  color: var(--fk-text-primary, inherit);
  font-size: 19px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 14px;
}
.calc-arrow {
  color: var(--fk-text-tertiary, #7a7a7a);
  font-size: 16px;
  padding: 0 18px;
}
.calc-result {
  color: var(--fk-text-primary, inherit);
  font-size: 21px;
  font-weight: 650;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 14px;
}
.calc-empty { color: var(--fk-text-tertiary, #7a7a7a); font-size: 13px; padding: 14px 4px; }

::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.35); border-radius: 5px; border: 3px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-track { background: transparent; }
`;
