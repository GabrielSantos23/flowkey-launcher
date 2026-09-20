// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../lib/listScroll', () => ({
  scrollSelectedIntoView: vi.fn(),
  resetListScroll: vi.fn(),
}));

import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';
import SplitListDetail from './SplitListDetail';

describe('SplitListDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderListItem = (item: any) => <div>{item?.title ?? ''}</div>;
  const detail = <div>Detail</div>;

  it('calls scrollSelectedIntoView on mount when selectedIndex >= 0', async () => {
    render(
      <SplitListDetail
        items={[{ id: '1', title: 'Item 1' }]}
        selectedIndex={0}
        listItem={renderListItem}
        detail={detail}
      />,
    );

    await new Promise((r) => requestAnimationFrame(r));
    expect(scrollSelectedIntoView).toHaveBeenCalledWith(expect.any(HTMLElement), 0);
  });

  it('calls scrollSelectedIntoView when items change', async () => {
    const { rerender } = render(
      <SplitListDetail
        items={[
          { id: '1', title: 'Item 1' },
          { id: '2', title: 'Item 2' },
        ]}
        selectedIndex={0}
        listItem={renderListItem}
        detail={detail}
      />,
    );

    await new Promise((r) => requestAnimationFrame(r));
    vi.clearAllMocks();

    rerender(
      <SplitListDetail
        items={[{ id: '2', title: 'Item 2' }]}
        selectedIndex={0}
        listItem={renderListItem}
        detail={detail}
      />,
    );

    await new Promise((r) => requestAnimationFrame(r));
    expect(scrollSelectedIntoView).toHaveBeenCalledWith(expect.any(HTMLElement), 0);
  });

  it('calls resetListScroll when selectedIndex < 0', async () => {
    render(
      <SplitListDetail items={[]} selectedIndex={-1} listItem={renderListItem} detail={detail} />,
    );

    await new Promise((r) => requestAnimationFrame(r));
    expect(resetListScroll).toHaveBeenCalledWith(expect.any(HTMLElement));
  });
});
