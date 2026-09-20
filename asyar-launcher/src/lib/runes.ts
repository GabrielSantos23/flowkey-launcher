/**
 * Runes shim — the last remnant of the Svelte migration.
 *
 * These services were written against Svelte 5 runes (`$state` class fields).
 * The Svelte toolchain is gone, so this shim keeps the same call-shape alive
 * with plain semantics:
 *
 *   `$state(init)`            → the initial value itself (plain, mutable)
 *   `$state.snapshot(value)`  → a deep copy, for saving mutable state
 *
 * React surfaces that must re-render on changes should hold a `Store<T>`
 * (src/lib/store.ts) and read it through `useStore`, not rely on this shim.
 */
export const $state = Object.assign(
  function $state<T>(initial: T): T {
    return initial;
  },
  {
    snapshot<T>(value: T): T {
      if (typeof structuredClone === 'function') {
        try {
          return structuredClone(value);
        } catch {
          /* fall through for non-cloneable values (functions, etc.) */
        }
      }
      return value;
    },
  },
);

export default $state;
