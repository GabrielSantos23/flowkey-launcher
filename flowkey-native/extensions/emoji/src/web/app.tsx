import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WebCommandProps } from '@flowkey-cli/native-sdk/web';
import {
  GRID_COLUMNS,
  filterOptions,
  flattenEmoji,
  moveIndex,
  searchSections,
  selectionAfterSearch,
  selectionTitle,
  type EmojiEntry,
} from '../emoji-model';
import { FREQUENT_SEED, isFrequent, toggleFrequent } from '../frequent';
import type { EmojiAction, ViewController } from './context';
import { loadFrequent, saveFrequent } from './frequent-store';
import { Icon } from './icons';
import {
  scrollIntentForKey,
  scrollIntentForPageAction,
  scrollTopFor,
  type ScrollIntent,
} from './scroll';

/**
 * The emoji picker: the shell renders the header (back, search box, category
 * dropdown) and the footer (Paste / Actions) around this page, so the page only
 * renders the grid and reports what those chrome pieces need.
 */

const SEARCH_PLACEHOLDER = 'Search Emoji & Symbols...';

function postToHost(message: Record<string, unknown>): void {
  const flowkey = (
    window as unknown as { flowkey?: { post(message: Record<string, unknown>): void } }
  ).flowkey;
  flowkey?.post(message);
}

/** One emoji tile; the ring marks the selection the chrome acts on. */
function Tile(props: {
  entry: EmojiEntry;
  selected: boolean;
  pinned: boolean;
  onSelect: () => void;
}): ReactNode {
  return createElement(
    'div',
    {
      className: props.selected ? 'em-tile em-tile-selected' : 'em-tile',
      title: selectionTitle(props.entry),
      onClick: props.onSelect,
    },
    createElement('span', { className: 'em-tile-emoji' }, props.entry.emoji),
    // wherever the emoji shows up, a star says it leads the Frequently Used list
    props.pinned
      ? createElement(
          'span',
          { className: 'em-tile-pin' },
          createElement(Icon, { name: 'star', size: 11 }),
        )
      : null,
  );
}

/** A titled block of tiles: "Frequently Used", then each gemoji category. */
function Section(props: {
  title: string;
  count: number;
  showCount: boolean;
  offset: number;
  items: readonly EmojiEntry[];
  selectedIndex: number;
  pinned: ReadonlySet<string>;
  onSelect: (index: number) => void;
}): ReactNode {
  return createElement(
    'section',
    { className: 'em-section' },
    createElement(
      'div',
      { className: 'em-section-header' },
      createElement('span', { className: 'em-section-title' }, props.title),
      props.showCount
        ? createElement('span', { className: 'em-section-count' }, `(${props.count})`)
        : null,
    ),
    createElement(
      'div',
      { className: 'em-grid' },
      props.items.map((entry, index) =>
        createElement(Tile, {
          key: `${entry.emoji}-${props.offset + index}`,
          entry,
          selected: props.offset + index === props.selectedIndex,
          pinned: props.pinned.has(entry.emoji),
          onSelect: () => props.onSelect(props.offset + index),
        }),
      ),
    ),
  );
}

export function EmojiWebApp(props: WebCommandProps): ReactNode {
  const query = props.query ?? '';
  const filterValue = props.filterValue ?? 'all';
  const capabilities = props.capabilities;

  const [selected, setSelected] = useState<{ glyph: string | null; index: number }>({
    glyph: null,
    index: -1,
  });
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  // the user's own list, seeded with the curated set until storage answers
  const [frequent, setFrequent] = useState<string[]>([...FREQUENT_SEED]);
  const [pinnedOnce, setPinnedOnce] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ViewController | null>(null);

  // the search box and the category dropdown are shell chrome: `query` is what
  // the user types, `filterValue` is the category the dropdown holds
  const sections = useMemo(
    () => searchSections(query, filterValue, frequent),
    [query, filterValue, frequent],
  );
  const emojis = useMemo(() => flattenEmoji(sections), [sections]);
  const filters = useMemo(() => filterOptions(), []);
  const pinned = useMemo(() => new Set(frequent), [frequent]);

  // the saved list wins over the seed once storage has answered
  useEffect(() => {
    let active = true;
    void loadFrequent(capabilities.storage).then((saved) => {
      if (active) setFrequent(saved);
    });
    return () => {
      active = false;
    };
  }, [capabilities]);

  // keep the selection across searches when its emoji is still offered, else
  // fall back to the first match so the primary action always has a target
  const index =
    selected.index >= 0 && emojis[selected.index]?.emoji === selected.glyph
      ? selected.index
      : selectionAfterSearch(sections, selected.glyph);
  const current = emojis[index] ?? null;

  const selectIndex = (next: number): void => {
    const entry = emojis[next];
    if (!entry) return;
    setSelected({ glyph: entry.emoji, index: next });
    setStatus(null);
  };

  const move = (columnDelta: number, rowDelta: number): boolean => {
    const next = moveIndex(index, emojis.length, GRID_COLUMNS, columnDelta, rowDelta);
    if (next < 0) return false;
    selectIndex(next);
    return true;
  };

  // ---- native actions -------------------------------------------------------

  const paste = async (): Promise<void> => {
    if (!current) return;
    try {
      // the shell writes the emoji to the clipboard, hides itself and pastes
      // into the app the user came from
      await capabilities.clipboard.paste(current.emoji);
    } catch (error) {
      setStatus({ text: message(error) || 'Could not paste the emoji', error: true });
    }
  };

  const copy = async (text: string, label: string): Promise<void> => {
    try {
      await capabilities.clipboard.write(text);
      setStatus({ text: `${label} copied to the clipboard`, error: false });
    } catch (error) {
      setStatus({ text: message(error) || 'Could not reach the clipboard', error: true });
    }
  };

  /**
   * Pins or unpins the selected emoji, then remembers the list. The list stays
   * usable for this session even when the shell refuses the write.
   */
  const toggleCurrentFrequent = async (wasPinned: boolean): Promise<void> => {
    if (!current) return;
    const next = toggleFrequent(frequent, current.emoji);
    setFrequent(next);
    setPinnedOnce(true);
    const saved = await saveFrequent(capabilities.storage, next);
    const what = `${current.emoji} ${wasPinned ? 'removed from' : 'added to'} Frequently Used`;
    setStatus(
      saved ? { text: what, error: false } : { text: `${what} (this session only)`, error: true },
    );
  };

  const actions: EmojiAction[] = useMemo(() => {
    if (!current) return [];
    const pinnedNow = isFrequent(frequent, current.emoji);
    return [
      { id: 'paste', title: 'Paste Emoji', icon: 'clipboard-paste', run: paste },
      {
        id: 'copy',
        title: 'Copy Emoji',
        icon: 'copy',
        run: () => copy(current.emoji, 'Emoji'),
      },
      {
        id: 'copy-name',
        title: 'Copy Name',
        icon: 'type',
        run: () => copy(selectionTitle(current), 'Name'),
      },
      {
        id: 'pin',
        title: pinnedNow ? 'Remove from Frequently Used' : 'Add to Frequently Used',
        icon: pinnedNow ? 'star-off' : 'star',
        run: () => toggleCurrentFrequent(pinnedNow),
      },
    ];
    // the actions follow the selection and the user's list, not the catalog
  }, [current, frequent]);

  // ---- scroll ---------------------------------------------------------------

  const scroll = (intent: ScrollIntent): boolean => {
    const node = contentRef.current;
    if (!node) return false;
    const top = scrollTopFor(intent, {
      scrollTop: node.scrollTop,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    });
    if (top === node.scrollTop) return false;
    node.scrollTop = top;
    return true;
  };

  // keep the selected tile in view as the selection walks the grid
  useEffect(() => {
    document.querySelector('.em-tile-selected')?.scrollIntoView({ block: 'nearest' });
  }, [index, query, filterValue]);

  const controller: ViewController = {
    primaryTitle: 'Paste',
    primary: () => void paste(),
    actions,
    scroll,
    move,
  };
  useEffect(() => {
    controllerRef.current = controller;
  });

  // ---- shell reporting ------------------------------------------------------

  // The shell's native Ctrl+K action panel renders these; committing one
  // comes back as a paletteAction message below.
  const paletteActions = useMemo(
    () => actions.map(({ id, title, icon }) => ({ id, title, icon })),
    [actions],
  );
  const stateKey = JSON.stringify({
    primaryTitle: controller.primaryTitle,
    hasActions: actions.length > 0,
    actions: paletteActions,
    filters,
    selectionTitle: current ? selectionTitle(current) : null,
    searchPlaceholder: SEARCH_PLACEHOLDER,
  });
  const lastStateRef = useRef('');
  useEffect(() => {
    if (lastStateRef.current === stateKey) return;
    lastStateRef.current = stateKey;
    postToHost({
      type: 'viewState',
      primaryTitle: controller.primaryTitle,
      canGoBack: false,
      hasActions: actions.length > 0,
      actions: paletteActions,
      // the shell renders these in the search-bar dropdown and sends the chosen
      // category back as `filterValue`
      filters,
      searchPlaceholder: SEARCH_PLACEHOLDER,
      // the footer names the selected emoji beside the command
      selectionTitle: current ? selectionTitle(current) : null,
    });
  });

  // ---- chrome interactions forwarded by the shell ---------------------------

  useEffect(() => {
    // the same message object arrives via both channels — run each once
    const seen = new WeakSet<object>();
    const handler = (event: Event): void => {
      const data = (event as MessageEvent).data as
        { type?: string; action?: string } | null | undefined;
      if (data?.type !== 'pageAction' && data?.type !== 'paletteAction') return;
      if (seen.has(data)) return;
      seen.add(data);
      const active = controllerRef.current;
      // the shell's native action panel committed one of the actions this
      // page reported in viewState
      if (data.type === 'paletteAction') {
        const action = (active?.actions ?? []).find((entry) => entry.id === data.action);
        if (action) void action.run();
        return;
      }
      if (data.action === 'moveDown' || data.action === 'moveUp') {
        // the shell's up/down move a whole row, the way a grid should
        if (active) active.move(0, data.action === 'moveDown' ? 1 : -1);
        return;
      }
      if (data.action === 'primary') {
        active?.primary();
        return;
      }
      const intent = scrollIntentForPageAction(data.action ?? '');
      if (intent !== null) active?.scroll(intent);
    };
    // direct webview listener: props/results prove this channel delivers
    const webview = (
      window as unknown as {
        chrome?: {
          webview?: {
            addEventListener(type: string, fn: (event: Event) => void): void;
            removeEventListener(type: string, fn: (event: Event) => void): void;
          };
        };
      }
    ).chrome?.webview;
    webview?.addEventListener('message', handler);
    window.addEventListener('flowkey-message', handler);
    return () => {
      webview?.removeEventListener('message', handler);
      window.removeEventListener('flowkey-message', handler);
    };
  }, []);

  // ---- keyboard while the page itself has focus -----------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      // a focused control owns its own keys
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const active = controllerRef.current;

      if (event.ctrlKey || event.metaKey) {
        if ((event.key === 'k' || event.key === 'K') && active) {
          // the webview swallows keystrokes, so the shell cannot see this
          // press: ask the shell to open its native action panel
          postToHost({ type: 'openPalette' });
          event.preventDefault();
        }
        return;
      }

      if (inField) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (active?.move(event.key === 'ArrowRight' ? 1 : -1, 0)) event.preventDefault();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (active?.move(0, event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
        return;
      }
      const intent = scrollIntentForKey(event.key);
      if (intent !== null) {
        if (active?.scroll(intent)) event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        active?.primary();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ---- render ---------------------------------------------------------------

  let body: ReactNode;
  if (emojis.length === 0) {
    body = createElement(
      'div',
      { className: 'em-empty' },
      createElement(Icon, { name: 'alert', size: 26 }),
      createElement('div', { className: 'em-empty-title' }, 'No emoji found'),
      createElement(
        'div',
        { className: 'em-empty-description' },
        `Nothing matches “${query.trim()}”. Try a name like “thumbs up”, an alias like “+1”, or a keyword like “party”.`,
      ),
    );
  } else {
    let offset = 0;
    body = createElement(
      'div',
      null,
      sections.map((section) => {
        const node = createElement(Section, {
          key: section.id,
          title: section.title,
          count: section.count,
          showCount: section.id !== 'frequent',
          offset,
          items: section.items,
          selectedIndex: index,
          pinned,
          onSelect: selectIndex,
        });
        offset += section.items.length;
        return node;
      }),
    );
  }

  // teach the pin action once, then get out of the way
  const hint =
    !pinnedOnce && query.trim() === '' && filterValue === 'all' && status === null
      ? 'Ctrl+K adds or removes the selected emoji from Frequently Used'
      : null;

  return createElement(
    'div',
    { className: 'em-app' },
    createElement(
      'div',
      { className: 'em-content', ref: contentRef, tabIndex: -1 },
      body,
      status
        ? createElement(
            'div',
            { className: status.error ? 'em-status em-status-error' : 'em-status' },
            status.text,
          )
        : hint
          ? createElement('div', { className: 'em-hint' }, hint)
          : null,
    ),
  );
}

/** The shell's failure message, when it sent one. */
function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return typeof error === 'string' ? error : '';
}
