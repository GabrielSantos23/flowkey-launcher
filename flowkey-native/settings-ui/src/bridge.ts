import { useCallback, useEffect, useState } from 'react';
import type { SettingsState } from './types';

interface WebView2Host {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
}

export function getHost(): WebView2Host | null {
  return (window as unknown as { chrome?: { webview?: WebView2Host } }).chrome?.webview ?? null;
}

export interface InvokeResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const pending = new Map<string, (result: InvokeResult) => void>();
let invokeCounter = 0;

/** Sends an invoke op to the shell; resolves with the shell's invokeResult. */
export function invoke(op: string, params?: Record<string, unknown>): Promise<InvokeResult> {
  const host = getHost();
  if (!host) {
    return Promise.resolve({ ok: false, error: 'outside the WebView2 host' });
  }
  const id = `s${++invokeCounter}`;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    host.postMessage({ type: 'invoke', id, op, params: params ?? {} });
  });
}

/** Resolves a pending invoke; called from the message pump in main.tsx. */
export function handleInvokeResult(data: {
  id?: unknown;
  ok?: unknown;
  result?: unknown;
  error?: unknown;
}) {
  if (typeof data.id !== 'string') {
    return;
  }
  const resolve = pending.get(data.id);
  if (!resolve) {
    return;
  }
  pending.delete(data.id);
  resolve({
    ok: data.ok === true,
    result: data.result,
    error: typeof data.error === 'string' ? data.error : undefined,
  });
}

type ThemeListener = (css: string) => void;
type StateListener = (state: SettingsState) => void;

const themeListeners = new Set<ThemeListener>();
const stateListeners = new Set<StateListener>();

/** Subscribes to shell state pushes; returns an unsubscribe function. */
export function onState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function onTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

/** Wires the WebView2 message pump once; safe to call before React renders. */
export function connectHost(): void {
  const host = getHost();
  if (!host) {
    return;
  }
  host.addEventListener('message', (event) => {
    const data = event.data as {
      type?: unknown;
      css?: unknown;
      state?: unknown;
      id?: unknown;
      ok?: unknown;
      result?: unknown;
      error?: unknown;
      message?: unknown;
    };
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.type === 'theme' && typeof data.css === 'string') {
      const style = document.getElementById('fk-theme');
      if (style) {
        style.textContent = data.css;
      }
      themeListeners.forEach((listener) => listener(data.css as string));
    } else if (data.type === 'state' && data.state && typeof data.state === 'object') {
      const state = data.state as SettingsState;
      stateListeners.forEach((listener) => listener(state));
    } else if (data.type === 'invokeResult') {
      handleInvokeResult(data);
    }
  });
  window.addEventListener('error', (event) => {
    host.postMessage({
      type: 'log',
      message: 'settings page error: ' + event.message,
    });
  });
  host.postMessage({ type: 'ready' });
}

/** React hook: the latest settings state pushed by the shell (null before the first push). */
export function useSettingsState(): SettingsState | null {
  const [state, setState] = useState<SettingsState | null>(null);
  useEffect(() => onState(setState), []);
  return state;
}

/** React hook: invokes an op and re-renders consumers of the returned revision. */
export function useInvoke() {
  return useCallback((op: string, params?: Record<string, unknown>) => invoke(op, params), []);
}
