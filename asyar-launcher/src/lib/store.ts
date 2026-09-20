export type Unsubscribe = () => void;

/**
 * Minimal observable store — the framework-agnostic replacement for Svelte 5
 * runes (`$state` / `$derived` are Svelte-only and cannot drive React
 * re-renders). Services own a `Store<T>` per piece of state; React reads it
 * through `useStore` (useSyncExternalStore) and anything else can subscribe
 * directly.
 *
 * getSnapshot returns the current value; it must be referentially stable
 * between mutations, which set() guarantees by only ever holding the value
 * the caller assigned.
 */
export class Store<T> {
  private value: T;
  private subscribers = new Set<() => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const notify of this.subscribers) notify();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe = (notify: () => void): Unsubscribe => {
    this.subscribers.add(notify);
    return () => {
      this.subscribers.delete(notify);
    };
  };
}
