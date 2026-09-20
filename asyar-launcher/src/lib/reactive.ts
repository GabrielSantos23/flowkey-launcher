/**
 * Minimal signals + effects — the reactivity layer that replaced Svelte 5
 * runes in the launcher's effect graph.
 *
 * `Signal` holds one value; reading it inside a running `effect()` registers
 * a dependency, writing it re-runs the dependent effects. Assignment is
 * guarded by `Object.is`, so an effect writing a value it also read does not
 * re-trigger itself.
 */

export function untrack<T>(fn: () => T): T {
  const prev = active;
  active = null;
  try {
    return fn();
  } finally {
    active = prev;
  }
}

interface EffectNode {
  id: number;
  run: () => void;
  deps: Set<Signal<unknown>>;
}

let effectCounter = 0;

let active: EffectNode | null = null;

/** @internal debug */
export function __activeEffectId(): number | null {
  return active?.id ?? null;
}

export class Signal<T> {
  #value: T;
  #subs = new Set<EffectNode>();
  #tag: string | undefined;

  constructor(initial: T, debugTag?: string) {
    this.#value = initial;
    this.#tag = debugTag;
  }

  /** Track: registers the running effect (if any) as a dependent. */
  get(): T {
    if (active) {
      this._addSub(active);
    }
    return this.#value;
  }

  /** Untracked read — for non-reactive contexts (logs, teardown). */
  peek(): T {
    return this.#value;
  }

  set(value: T): void {
    if (Object.is(value, this.#value)) return;
    this.#value = value;
    if (this.#tag)
      console.log('[sig]', this.#tag, 'SET subs:', [...this.#subs].map((n) => n.id).join(','));
    // Copy: an effect that re-subscribes mid-run must not be iterated twice.
    this._notify();
    notifyReact();
  }

  /** @internal */
  _addSub(node: EffectNode): void {
    if (this.#tag)
      console.log('[sig]', this.#tag, 'ADD node', node.id, 'subs:', this.#subs.size + 1);
    this.#subs.add(node);
    node.deps.add(this as unknown as Signal<unknown>);
  }

  /** @internal */
  _removeSub(node: EffectNode): void {
    if (this.#tag)
      console.log('[sig]', this.#tag, 'REMOVE node', node.id, 'subs:', this.#subs.size - 1);
    this.#subs.delete(node);
  }

  /** @internal */
  _notify(): void {
    for (const node of [...this.#subs]) node.run();
  }
}

/** Runs `fn` immediately, then whenever any signal read inside it changes. */
export function effect(fn: () => void): () => void {
  const node: EffectNode = {
    id: ++effectCounter,
    run: () => {},
    deps: new Set<Signal<unknown>>(),
  };
  node.run = () => {
    for (const dep of node.deps) dep._removeSub(node);
    node.deps.clear();
    const prev = active;
    active = node;
    try {
      fn();
    } finally {
      active = prev;
    }
  };
  node.run();
  return () => {
    for (const dep of node.deps) dep._removeSub(node);
    node.deps.clear();
  };
}

// ── React bridge ────────────────────────────────────────────────────────────
// React components read plain fields from services; they cannot subscribe to
// individual signals. A single global version counter bumps on every signal
// write, and `useLauncherVersion()` re-renders the subscribing component
// whenever anything changed. Coarse, but exactly matches what Svelte's
// fine-grained graph did for these pages.

import { useSyncExternalStore } from 'react';

let version = 0;
const versionListeners = new Set<() => void>();

export function notifyReact(): void {
  version++;
  for (const listener of [...versionListeners]) listener();
}

export function subscribeReact(listener: () => void): () => void {
  versionListeners.add(listener);
  return () => {
    versionListeners.delete(listener);
  };
}

export function getLauncherVersion(): number {
  return version;
}

/** Re-renders the calling component whenever ANY signal changes. */
export function useLauncherVersion(): number {
  return useSyncExternalStore(subscribeReact, getLauncherVersion, getLauncherVersion);
}
