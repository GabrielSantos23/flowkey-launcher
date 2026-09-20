import React from 'react';

export interface KeyboardHintProps {
  keys: string | string[];
  action?: string;
  className?: string;
}

export default function KeyboardHint({ keys, action, className = '' }: KeyboardHintProps) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div className="inline-flex items-center gap-1">
        {keyList.map((key, i) => (
          <kbd
            key={i}
            className="px-1.5 py-0.5 min-w-[20px] text-center font-mono text-xs rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] shadow-sm"
          >
            {key}
          </kbd>
        ))}
      </div>
      {action ? <span className="text-xs text-[var(--text-secondary)]">{action}</span> : null}
    </div>
  );
}

export function renderKeyboardHint({
  keys,
  action,
}: {
  keys: string[];
  action?: string;
}): HTMLElement {
  const div = document.createElement('div');
  div.className = 'keyboard-hint';
  for (const k of keys) {
    const kbd = document.createElement('kbd');
    kbd.textContent = k;
    div.appendChild(kbd);
  }
  if (action) {
    const act = document.createElement('span');
    act.className = 'action';
    act.textContent = action;
    div.appendChild(act);
  }
  return div;
}
