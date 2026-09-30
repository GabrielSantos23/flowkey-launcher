import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type { WebCommandProps } from '@flowkey-cli/native-sdk/web';
import { evaluate } from '../engine/evaluator';

/**
 * The calculator panel, styled like the Raycast calculator card: a
 * "Calculator" label over a centered expression → answer card. The launcher's
 * search bar is the input (props.query updates live); Enter copies the answer.
 */

function postToHost(message: Record<string, unknown>): void {
  const flowkey = (
    window as unknown as { flowkey?: { post(message: Record<string, unknown>): void } }
  ).flowkey;
  flowkey?.post(message);
}

async function loadRates(
  capabilities: WebCommandProps['capabilities'],
): Promise<Map<string, number> | null> {
  const cached = (await capabilities.storage.get('rates').catch(() => null)) as
    | { rates?: Record<string, number> }
    | null;
  if (!cached?.rates) {
    return null;
  }
  const map = new Map<string, number>();
  for (const [code, rate] of Object.entries(cached.rates)) {
    map.set(code.toUpperCase(), rate);
  }
  map.set('USD', 1);
  return map;
}

export function CalculatorWebApp(props: WebCommandProps): ReactNode {
  const capabilities = props.capabilities;
  const query = props.query ?? '';

  const [rates, setRates] = useState<Map<string, number> | null>(null);

  const latest = useRef({
    result: null as ReturnType<typeof evaluate>,
    copyAnswer: async () => {},
  });

  useEffect(() => {
    void loadRates(capabilities).then(setRates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = query.trim().length >= 2 ? evaluate(query, { now: () => new Date(), rates }) : null;
  latest.current.result = result;

  latest.current.copyAnswer = async () => {
    const current = latest.current.result;
    if (current) {
      await capabilities.clipboard.write(current.copyText);
    }
  };

  // ---- shell reporting ------------------------------------------------------

  const stateKey = JSON.stringify({
    primaryTitle: 'Copy Answer',
    hasActions: !!result,
    searchPlaceholder: 'Type an expression...',
  });
  const lastStateRef = useRef('');
  useEffect(() => {
    if (lastStateRef.current === stateKey) return;
    lastStateRef.current = stateKey;
    postToHost({
      type: 'viewState',
      primaryTitle: 'Copy Answer',
      canGoBack: false,
      hasActions: !!result,
      actions: result ? [{ id: 'copy', title: 'Copy Answer' }] : [],
      searchPlaceholder: 'Type an expression...',
    });
  });

  const runPrimary = (): void => {
    void latest.current.copyAnswer();
  };

  // ---- chrome interactions + keyboard --------------------------------------

  useEffect(() => {
    const seen = new WeakSet<object>();
    const handler = (event: Event): void => {
      const data = (event as MessageEvent).data as { type?: string; action?: string } | null | undefined;
      if (data?.type !== 'pageAction' && data?.type !== 'paletteAction') return;
      if (seen.has(data)) return;
      seen.add(data);
      if (data.type === 'paletteAction' || data.action === 'primary') {
        runPrimary();
      }
    };
    const webview = (
      window as unknown as {
        chrome?: {
          webview?: {
            addEventListener(t: string, fn: (e: Event) => void): void;
            removeEventListener(t: string, fn: (e: Event) => void): void;
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
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'k' || event.key === 'K') {
          postToHost({ type: 'openPalette' });
          event.preventDefault();
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        runPrimary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ---- render ---------------------------------------------------------------

  return createElement(
    'div',
    { className: 'calc-app' },
    createElement(
      'div',
      { className: 'calc-scroll' },
      createElement('div', { className: 'calc-section-label' }, 'Calculator'),
      result
        ? createElement(
            'div',
            { className: 'calc-card' },
            createElement('span', { className: 'calc-expression' }, result.expression),
            createElement('span', { className: 'calc-arrow' }, '→'),
            createElement('span', { className: 'calc-result' }, result.result),
          )
        : createElement(
            'div',
            { className: 'calc-empty' },
            'Try 12*48+3 · sqrt(625) · 5km to mi · $50 in eur · 20% off $90 · time in Tokyo',
          ),
    ),
  );
}
