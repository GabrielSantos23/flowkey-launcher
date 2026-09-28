import {
  createElement,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { WebCommandProps } from '@flowkey-cli/native-sdk/web';
import type { NativeCallFn } from '../api/client';
import { languageName } from '../languages';
import { languagePairLabel, readTranslatePreferences } from '../preferences';
import {
  clipboardSource,
  detectedLanguage,
  emptyTextFailureTitle,
  failureTitle,
  resolvePair,
  resultCards,
  screenForCommand,
  sourceFilterOptions,
  targetFilterOptions,
  viewPhase,
  type LanguagePair,
  type TranslationRun,
} from '../translation-model';
import { EmptyView, FailureRow, SourceRow, StatusLine, TranslationRow } from './chrome';
import type { TranslateAction, ViewController } from './context';
import { capabilitiesToNativeCall } from './native-call';
import {
  scrollIntentForKey,
  scrollIntentForPageAction,
  scrollTopFor,
  type ScrollIntent,
} from './scroll';
import { useClipboardText, useTranslations } from './use-translation';

const IDLE: TranslationRun = { loading: false, failure: null, result: null };
/** Row key of the source card, which is not a language card. */
const SOURCE_KEY = 'source';

function postToHost(message: Record<string, unknown>): void {
  const flowkey = (
    window as unknown as { flowkey?: { post(message: Record<string, unknown>): void } }
  ).flowkey;
  flowkey?.post(message);
}

/** Moves the card selection by one, wrapping; false when there are no cards. */
function moveCardSelection(controller: ViewController | null, delta: number): boolean {
  const rows = controller?.rows ?? [];
  if (rows.length === 0 || !controller?.select) return false;
  const index = rows.findIndex((row) => row.key === controller.selectedKey);
  const next = rows[(index + delta + rows.length) % rows.length];
  controller.select(next.key);
  return true;
}

/** The single web surface shared by all three translation commands. */
export function TranslateWebApp(props: WebCommandProps): ReactNode {
  const screen = screenForCommand(props.environment?.commandId);
  const call: NativeCallFn = useMemo(
    () => capabilitiesToNativeCall(props.capabilities),
    [props.capabilities],
  );
  const preferences = props.preferences ?? {};
  const prefs = useMemo(() => readTranslatePreferences(preferences), [preferences]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [clipboardNonce, setClipboardNonce] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [copyError, setCopyError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ViewController | null>(null);

  // a different command (re)opened from the launcher starts from the preferences
  useEffect(() => {
    setSelectedKey(null);
  }, [screen]);

  // ---- language pair -------------------------------------------------------

  // The language lives in the shell's search-bar dropdown: Quick Translate
  // picks the source it translates FROM, the single-target commands pick the
  // language to translate INTO. The shell sends the choice back as
  // `filterValue`, sticky across searches, and the preferences are the
  // fallback until the user picks one.
  const quick = screen === 'quick-translate';
  const filterValue = (props.filterValue ?? '').trim();
  const pickedFrom = quick ? filterValue || prefs.langFrom : prefs.langFrom;
  const pickedTarget = !quick && filterValue ? filterValue : prefs.lang1;
  const baseTargets = quick
    ? [prefs.lang1, prefs.lang2].filter(
        (target, index, all) => !!target && all.indexOf(target) === index,
      )
    : [pickedTarget];
  const pair = quick ? null : resolvePair(pickedFrom, pickedTarget, prefs.lang2);
  const from = pair ? pair.from : pickedFrom;
  const targets = quick ? baseTargets : [pair ? pair.to : 'en'];
  const filters = useMemo(
    () => (quick ? sourceFilterOptions(from) : targetFilterOptions(from, targets[0] ?? 'en')),
    [from, quick, targets],
  );

  // ---- source text ---------------------------------------------------------

  const usesClipboard = screen === 'translate-clipboard';
  const clipboard = useClipboardText(call, clipboardNonce, usesClipboard);
  const typed = (props.query ?? '').trim();
  const source = clipboardSource(props.query ?? '', usesClipboard ? clipboard.text : '');
  const text = source.text;
  // typing wins over a clipboard read that is still in flight
  const pendingClipboard = usesClipboard && !typed && clipboard.state === 'loading';
  const runs = useTranslations(call, text, from, targets, !pendingClipboard, retryNonce);

  const targetRuns = targets.map((target) => ({ target, run: runs[target] ?? IDLE }));
  const primary = targetRuns[0]?.run ?? IDLE;
  const cards = resultCards(targetRuns, from);
  const phase = viewPhase(text, primary);
  const detected = primary.result ? detectedLanguage(from, primary.result) : undefined;
  const busy = targetRuns.some((entry) => entry.run.loading);

  // ---- rows / selection ----------------------------------------------------

  const rowKeys = useMemo(
    () =>
      source.fromClipboard
        ? [SOURCE_KEY, ...cards.map((card) => card.key)]
        : cards.map((card) => card.key),
    [source.fromClipboard, cards],
  );
  const rowKey = rowKeys.join('|');
  useEffect(() => {
    if (rowKeys.length === 0) {
      if (selectedKey !== null) setSelectedKey(null);
      return;
    }
    if (selectedKey === null || !rowKeys.includes(selectedKey)) {
      // the translation is what the user came for, so it starts selected
      setSelectedKey(cards[0]?.key ?? rowKeys[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

  // Copy feedback is the shell's HUD, which also hides the launcher — the
  // window getting out of the way is the point of copying. A failed copy keeps
  // the window open and says so in-page instead.
  useEffect(() => {
    if (!copyError) return;
    const timer = setTimeout(() => setCopyError(null), 2400);
    return () => clearTimeout(timer);
  }, [copyError]);

  const copy = (value: string, label: string): void => {
    if (!value) return;
    void call('clipboard.write', { text: value })
      .then(
        () => call('hud.show', { title: `${label} — copied` }),
        () => setCopyError('Could not copy to the clipboard'),
      )
      // the text is already on the clipboard by now: a failure to confirm it
      // must be visible, never a silent no-op
      .catch(() => setCopyError('Copied, but FlowKey could not confirm it'));
  };
  const retry = (): void => setRetryNonce((value) => value + 1);
  const reloadClipboard = (): void => setClipboardNonce((value) => value + 1);

  const copySelected = (): void => {
    if (selectedKey === SOURCE_KEY) {
      copy(text, 'Original');
      return;
    }
    const card = cards.find((entry) => entry.key === selectedKey);
    if (card) copy(card.text, card.copyLabel);
  };

  // ---- actions (rendered by the shell's native Ctrl+K panel) ----------------

  const actions: TranslateAction[] = useMemo(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const list: TranslateAction[] = [];
    const card = cards.find((entry) => entry.key === selectedKey);
    if (selectedKey === SOURCE_KEY || !card) {
      if (text) {
        list.push({
          id: 'copy-original',
          title: 'Copy Original',
          icon: 'copy',
          run: () => copy(text, 'Original'),
        });
      }
      if (usesClipboard) {
        list.push({
          id: 'reload-clipboard',
          title: 'Re-read Clipboard',
          icon: 'refresh',
          run: reloadClipboard,
        });
      }
    }
    if (card) {
      if (card.failed) {
        list.push({ id: 'retry', title: 'Retry Translation', icon: 'refresh', run: retry });
      } else {
        list.push({
          id: 'copy',
          title: card.copyLabel,
          icon: 'copy',
          run: () => copy(card.text, card.copyLabel),
        });
        if (card.pronunciation) {
          list.push({
            id: 'copy-pronunciation',
            title: 'Copy Pronunciation',
            icon: 'type',
            run: () => copy(card.pronunciation, 'Pronunciation'),
          });
        }
        if (text && card.text !== text) {
          list.push({
            id: 'copy-original',
            title: 'Copy Original',
            icon: 'copy',
            run: () => copy(text, 'Original'),
          });
        }
      }
    } else if (text) {
      list.push({ id: 'retry', title: 'Retry Translation', icon: 'refresh', run: retry });
    }
    return list;
  }, [cards, screen, selectedKey, text, usesClipboard]);

  const controller: ViewController = {
    title: targets.map((target) => languagePairLabel(from, target)).join('  ·  '),
    primaryTitle:
      selectedKey === SOURCE_KEY
        ? 'Copy Original'
        : (cards.find((entry) => entry.key === selectedKey)?.copyLabel ?? 'Copy Translation'),
    primary: copySelected,
    actions,
    rows: rowKeys.map((key) => ({ key })),
    selectedKey,
    select: setSelectedKey,
    scroll: (intent: ScrollIntent): boolean => {
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
    },
  };
  useEffect(() => {
    controllerRef.current = controller;
  });

  // ---- shell reporting -----------------------------------------------------

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
      // the shell renders these in the search-bar dropdown and sends the
      // chosen value back as `filterValue`
      filters,
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
        moveCardSelection(active, data.action === 'moveDown' ? 1 : -1);
        return;
      }
      if (data.action === 'primary') {
        active?.primary();
        return;
      }
      const intent = scrollIntentForPageAction(data.action ?? '');
      if (intent !== null) active?.scroll?.(intent);
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
      // a focused control (language select) owns its own keys
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
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

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (inField) return;
        if (moveCardSelection(active, event.key === 'ArrowDown' ? 1 : -1)) {
          event.preventDefault();
        }
        return;
      }
      const intent = scrollIntentForKey(event.key);
      if (intent !== null) {
        if (!inField && active?.scroll?.(intent)) event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        if (inField) return; // a focused select owns Enter
        if (!active) return;
        event.preventDefault();
        active.primary();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ---- render ---------------------------------------------------------------

  let body: ReactNode;
  if (usesClipboard && clipboard.state === 'error') {
    body = createElement(EmptyView, {
      title: 'Could not read the clipboard',
      description:
        'FlowKey could not access the current clipboard text. Copy the text again, or just type it.',
      tone: 'error',
    });
  } else if (!text.trim()) {
    body = createElement(EmptyView, {
      title: usesClipboard && !pendingClipboard ? 'Clipboard is empty' : 'Type text to translate',
      description: usesClipboard
        ? 'Copy some text anywhere, then reopen this command — or type the text to translate.'
        : `Type in the search box to translate into ${targets
            .map((target) => languageName(target))
            .join(' and ')}.`,
    });
  } else if (pendingClipboard) {
    body = createElement(EmptyView, { title: 'Reading clipboard…' });
  } else if (cards.length === 0) {
    if (phase === 'loading') {
      body = createElement(EmptyView, { title: 'Translating…' });
    } else if (phase === 'failed') {
      body = createElement(EmptyView, {
        title: failureTitle(primary.failure ?? { kind: 'unavailable', message: '' }),
        description: primary.failure?.message,
        tone: 'error',
      });
    } else if (phase === 'empty') {
      body = createElement(EmptyView, {
        title: emptyTextFailureTitle(),
        description: 'Google returned a valid response with no translation for this text.',
      });
    } else {
      body = createElement(EmptyView, { title: 'Nothing to translate yet' });
    }
  } else {
    body = createElement(
      Fragment,
      null,
      source.fromClipboard
        ? createElement(SourceRow, {
            text,
            fromClipboard: true,
            selected: selectedKey === SOURCE_KEY,
            onSelect: () => setSelectedKey(SOURCE_KEY),
          })
        : null,
      cards.map((card) =>
        card.failed
          ? createElement(FailureRow, {
              key: card.key,
              card,
              failure: targetRuns.find((entry) => entry.target === card.key)?.run.failure ?? null,
              selected: selectedKey === card.key,
              onSelect: () => setSelectedKey(card.key),
            })
          : createElement(TranslationRow, {
              key: card.key,
              text: card.text,
              subtitle: card.pairLabel,
              selected: selectedKey === card.key,
              onSelect: () => setSelectedKey(card.key),
            }),
      ),
      createElement(StatusLine, {
        text:
          copyError ?? (busy ? (cards.length > 0 ? 'Updating translation…' : 'Translating…') : ''),
        busy: busy && !copyError,
        error: !!copyError,
      }),
    );
  }

  return createElement(
    'div',
    { className: 'gt-app' },
    createElement(
      'div',
      { className: 'gt-content', ref: contentRef, tabIndex: -1, key: screen },
      body,
    ),
  );
}
