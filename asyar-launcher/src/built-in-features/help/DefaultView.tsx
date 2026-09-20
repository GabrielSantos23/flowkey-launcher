import React, { useEffect, useRef } from 'react';
import { helpViewState } from './helpState';
import { LAUNCHER_SHORTCUTS } from '../../lib/keyboard/shortcutCatalog';
import { Icon } from '../../components/react/Icon';
import { getBuiltInIconName, isBuiltInIcon } from '../../lib/iconUtils';
import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';

export default function DefaultView() {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const index = helpViewState.selectedIndex;
    if (index >= 0) {
      scrollSelectedIntoView(listEl, index);
    } else {
      resetListScroll(listEl);
    }
  }, [helpViewState.selectedIndex, helpViewState.filtered]);

  return (
    <div className="help-view flex flex-col gap-6 p-5 overflow-y-auto h-full" ref={listRef}>
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-2 font-semibold">
          Keyboard Shortcuts
        </h2>
        <ul className="list-none m-0 p-0 flex flex-col">
          {LAUNCHER_SHORTCUTS.map((s, i) => (
            <li key={i} className="flex items-center gap-4 py-1 px-2">
              <span className="inline-flex gap-1 min-w-[88px] shrink-0">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="font-mono text-xs px-2 py-0.5 rounded-[var(--radius-xs)] bg-[var(--bg-secondary)] border border-[var(--separator)] text-[var(--text-primary)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">{s.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-2 font-semibold">
          Feature Guides
        </h2>
        <ul className="list-none m-0 p-0 flex flex-col">
          {helpViewState.filtered.map((topic, i) => {
            const isSelected = i === helpViewState.selectedIndex;
            return (
              <li
                key={topic.slug}
                className={`flex items-center gap-3 py-2 px-3 rounded-[var(--radius-md)] cursor-default ${
                  isSelected ? 'bg-[var(--bg-selected)]' : ''
                }`}
                data-index={i}
              >
                {isBuiltInIcon(topic.icon) && (
                  <Icon name={getBuiltInIconName(topic.icon)} size={18} />
                )}
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-[var(--text-primary)]">{topic.title}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{topic.subtitle}</span>
                </span>
              </li>
            );
          })}
          {helpViewState.filtered.length === 0 && (
            <li className="text-sm text-[var(--text-tertiary)] py-3 px-2">
              No topics match your search.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
