import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WebCommandProps } from '@flowkey-cli/native-sdk/web';
import type { ClipboardEntry, ViewController } from './context';
import { Icon } from './icons';
import {
  actionsForSelection,
  detailFields,
  entrySections,
  formatCopiedTime,
  isLightColor,
  kindIcon,
  previewText,
  selectionAfterRemoval,
  selectionForEntries,
} from './clipboard-model';
import {
  scrollIntentForKey,
  scrollIntentForPageAction,
  scrollTopFor,
  type ScrollIntent,
} from './scroll';

function postToHost(message: Record<string, unknown>): void {
  const flowkey = (
    window as unknown as { flowkey?: { post(message: Record<string, unknown>): void } }
  ).flowkey;
  flowkey?.post(message);
}

export function ClipboardWebApp(props: WebCommandProps): ReactNode {
  const query = props.query ?? '';
  const capabilities = props.capabilities;
  // the preference is a checkbox: boolean true/false when set, absent before
  // the user touches it — default to showing
  const showTimestamps = (props.preferences['showTimestamps'] as boolean | undefined) !== false;

  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ViewController | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const latest = useRef({
    entries,
    query,
    refresh: async (filter: string): Promise<void> => {},
    runAction: async (actionId: string): Promise<void> => {},
    move: (_delta: 1 | -1) => {},
    scroll: (_intent: ScrollIntent): boolean => false,
  });
  latest.current.entries = entries;
  latest.current.query = query;

  latest.current.refresh = async (filter: string): Promise<void> => {
    try {
      const items = (await capabilities.clipboard.history({
        query: filter,
        limit: 100,
      })) as unknown as ClipboardEntry[];
      setEntries(items);
      setLoadError(null);
      setSelectedId((current) => selectionForEntries(items, current));
    } catch {
      setLoadError('Could not read the clipboard history');
    }
  };

  latest.current.runAction = async (actionId: string): Promise<void> => {
    const entry = latest.current.entries.find(
      (candidate) => candidate.id === selectedRef.current,
    );
    if (!entry) return;
    if (actionId === 'paste') {
      // the shell pastes into the foreground app and hides the launcher; the
      // paste re-copies the entry, so the list re-orders on next open
      await capabilities.clipboard.pasteEntry(entry.id);
      return;
    }
    if (actionId === 'copy') {
      if (entry.kind === 'image') {
        await capabilities.clipboard.copyEntry(entry.id);
      } else {
        await capabilities.clipboard.write(entry.text);
      }
      await capabilities.hud.show({ title: 'Copied to clipboard' });
      setTimeout(() => void latest.current.refresh(latest.current.query.trim()), 400);
      return;
    }
    if (actionId === 'edit') {
      await capabilities.clipboard.editEntry(entry.id);
      return;
    }
    if (actionId === 'delete') {
      await capabilities.clipboard.deleteEntry(entry.id);
      const fresh = latest.current.entries.filter(
        (candidate) => candidate.id !== entry.id,
      );
      setEntries(fresh);
      setSelectedId(selectionAfterRemoval(fresh, entry.id));
    }
  };

  latest.current.move = (delta: 1 | -1): void => {
    const items = latest.current.entries;
    if (items.length === 0) return;
    const at = items.findIndex((entry) => entry.id === selectedRef.current);
    const next = at === -1 ? 0 : Math.min(items.length - 1, Math.max(0, at + delta));
    setSelectedId(items[next].id);
  };

  latest.current.scroll = (intent: ScrollIntent): boolean => {
    const node = listRef.current;
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

  // the launcher search box is the single filter field; every keystroke
  // re-queries the in-memory history
  useEffect(() => {
    void latest.current.refresh(query.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // keep the selected row visible while arrowing or wheeling through the list
  useEffect(() => {
    document.querySelector('.cl-row-selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // the wheel moves the selection, so the highlight and the detail pane follow
  // the scroll (the list's own scrollbar stays as a drag affordance)
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent): void => {
      if (latest.current.entries.length === 0) return;
      event.preventDefault();
      latest.current.move(event.deltaY > 0 ? 1 : -1);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });

  const controller: ViewController = {
    primaryTitle: 'Paste',
    primary: () => void latest.current.runAction('paste'),
    actions: selected ? actionsForSelection() : [],
    selectedId,
    select: setSelectedId,
    move: (delta) => latest.current.move(delta),
    scroll: (intent) => latest.current.scroll(intent),
  };
  useEffect(() => {
    controllerRef.current = controller;
  });

  // ---- shell reporting ------------------------------------------------------

  // the footer names the entry beside the command; the shell's native Ctrl+K
  // panel renders the actions, and committing one comes back as paletteAction
  const selectionTitle = selected ? previewText(selected, 60) : null;
  const actions = controller.actions;
  const stateKey = JSON.stringify({
    primaryTitle: controller.primaryTitle,
    hasActions: actions.length > 0,
    actions,
    selectionTitle,
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
      actions,
      // the launcher search box is a plain filter — no dropdown
      searchPlaceholder: 'Type to filter entries...',
      selectionTitle,
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
      // the shell's native action panel committed one of the actions this
      // page reported in viewState
      if (data.type === 'paletteAction') {
        void latest.current.runAction(data.action ?? '');
        return;
      }
      if (data.action === 'clipboardChanged') {
        // the shell captured a new copy — re-query so the list reflects it
        void latest.current.refresh(latest.current.query.trim());
        return;
      }
      if (data.action === 'moveDown' || data.action === 'moveUp') {
        latest.current.move(data.action === 'moveDown' ? 1 : -1);
        return;
      }
      if (data.action === 'primary') {
        void latest.current.runAction('paste');
        return;
      }
      const intent = scrollIntentForPageAction(data.action ?? '');
      if (intent !== null) latest.current.scroll(intent);
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
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (active) {
          active.move(event.key === 'ArrowDown' ? 1 : -1);
          event.preventDefault();
        }
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

  const sections = entrySections(entries, Date.now());

  let left: ReactNode;
  if (loadError !== null) {
    left = createElement(
      'div',
      { className: 'cl-empty' },
      createElement('div', { className: 'cl-empty-title' }, loadError),
    );
  } else if (entries.length === 0) {
    left = createElement(
      'div',
      { className: 'cl-empty' },
      createElement('div', { className: 'cl-empty-title' }, 'Clipboard history is empty'),
      createElement(
        'div',
        { className: 'cl-empty-description' },
        'Copy some text anywhere and it shows up here.',
      ),
    );
  } else {
    left = sections.map((section) =>
      createElement(
        'div',
        { key: section.id },
        createElement('div', { className: 'cl-section-title' }, section.title),
        section.entries.map((entry) =>
          createElement(
            'div',
            {
              key: entry.id,
              className: entry.id === selectedId ? 'cl-row cl-row-selected' : 'cl-row',
              onMouseEnter: () => setSelectedId(entry.id),
              onClick: () => setSelectedId(entry.id),
            },
            createElement(RowIcon, { entry }),
            createElement('span', { className: 'cl-row-text' }, previewText(entry)),
          ),
        ),
      ),
    );
  }

  return createElement(
    'div',
    { className: 'cl-app' },
    createElement('div', { className: 'cl-list', ref: listRef, tabIndex: -1 }, left),
    createElement(DetailPane, { entry: selected, showTimestamps }),
  );
}

function RowIcon(props: { entry: ClipboardEntry }): ReactNode {
  if (props.entry.kind === 'image' && props.entry.iconUri) {
    return createElement('span', { className: 'cl-row-icon' }, createElement('img', {
      src: props.entry.iconUri,
      alt: '',
    }));
  }
  if (props.entry.kind === 'color') {
    return createElement(
      'span',
      { className: 'cl-row-icon' },
      createElement('span', {
        className: 'cl-row-swatch',
        style: { background: props.entry.text },
      }),
    );
  }
  return createElement(
    'span',
    { className: 'cl-row-icon' },
    createElement(Icon, { name: kindIcon(props.entry.kind), size: 15 }),
  );
}

function DetailPane(props: { entry: ClipboardEntry | null; showTimestamps: boolean }): ReactNode {
  if (!props.entry) {
    return createElement('div', { className: 'cl-detail' });
  }
  const entry = props.entry;
  let preview: ReactNode;
  if (entry.kind === 'color') {
    // a clean swatch with the hex on it — the shell-rendered card image
    // would blow up to fill the pane
    preview = createElement(
      'div',
      {
        className: isLightColor(entry.text) ? 'cl-color-swatch cl-color-light' : 'cl-color-swatch',
        style: { background: entry.text },
      },
      createElement('span', { className: 'cl-color-hex' }, entry.text),
    );
  } else if (entry.previewImageUri) {
    // images use the 320px preview
    preview = createElement('img', { src: entry.previewImageUri, alt: '' });
  } else if (entry.kind === 'file') {
    preview = createElement(
      'ul',
      { className: 'cl-preview-files' },
      entry.text.split('\n').map((path) => createElement('li', { key: path }, path)),
    );
  } else {
    preview = createElement('pre', { className: 'cl-preview-text' }, entry.text || '(empty)');
  }
  return createElement(
    'div',
    { className: 'cl-detail' },
    createElement('div', { className: 'cl-preview' }, preview),
    createElement('div', { className: 'cl-info-title' }, 'Information'),
    createElement(
      'div',
      { className: 'cl-info' },
      detailFields(entry).map((field) =>
        createElement(
          'div',
          { className: 'cl-info-row', key: field.label },
          createElement('span', { className: 'cl-info-label' }, field.label),
          createElement(
            'span',
            { className: 'cl-info-value' },
            field.label === 'Source' && entry.sourceIconUri
              ? createElement('img', { src: entry.sourceIconUri, alt: '' })
              : null,
            createElement('span', null, field.value),
          ),
        ),
      ),
      props.showTimestamps
        ? createElement(
            'div',
            { className: 'cl-info-row' },
            createElement('span', { className: 'cl-info-label' }, 'Copied'),
            createElement(
              'span',
              { className: 'cl-info-value' },
              createElement('span', null, formatCopiedTime(entry.timestamp, Date.now())),
            ),
          )
        : null,
    ),
  );
}
