import { useSyncExternalStore } from 'react';
import type { Store } from '../lib/store';

/** Reads a Store into React rendering; re-renders on every mutation. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(),
    () => store.get(),
  );
}
