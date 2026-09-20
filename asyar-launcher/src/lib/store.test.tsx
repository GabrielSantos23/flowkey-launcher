// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Store } from './store';
import { useStore } from '../react-bridge/useStore';

describe('Store', () => {
  it('notifies subscribers only on real changes', () => {
    const store = new Store(1);
    const spy = vi.fn();
    const unsub = store.subscribe(spy);

    store.set(1);
    expect(spy).not.toHaveBeenCalled();
    store.set(2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe(2);

    unsub();
    store.set(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('update() derives the next value from the current one', () => {
    const store = new Store({ count: 1 });
    store.update((s) => ({ count: s.count + 1 }));
    expect(store.get().count).toBe(2);
  });
});

function Probe({ store }: { store: Store<number> }) {
  const value = useStore(store);
  return <span data-testid="probe">{value}</span>;
}

describe('useStore', () => {
  it('re-renders the component on store mutations', () => {
    const store = new Store('a');
    render(<Probe store={store} />);
    expect(screen.getByTestId('probe').textContent).toBe('a');

    act(() => store.set('b'));
    expect(screen.getByTestId('probe').textContent).toBe('b');
  });
});
