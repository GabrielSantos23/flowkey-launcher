import React, { useRef, useEffect } from 'react';
import SplitView from '../list/SplitView';
import { EmptyState, LoadingState } from '../react/Feedback';
import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';

export interface SplitListDetailProps<T = any> {
  items?: T[];
  selectedIndex?: number;
  leftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  ariaLabel?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  error?: string | null;
  emptyMessage?: string;
  listItem?: (item: T, index: number) => React.ReactNode;
  list?: React.ReactNode;
  detail: React.ReactNode;
}

export default function SplitListDetail<T extends { id?: string | number } = any>({
  items,
  selectedIndex = -1,
  leftWidth = 280,
  minLeftWidth = 200,
  maxLeftWidth = 600,
  ariaLabel = 'Items',
  isLoading = false,
  loadingMessage = 'Loading...',
  error = null,
  emptyMessage = 'No items found',
  listItem,
  list,
  detail,
}: SplitListDetailProps<T>) {
  const listContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedIndex >= 0 && !isLoading && !error) {
      requestAnimationFrame(() => {
        if (listContainerRef.current)
          scrollSelectedIntoView(listContainerRef.current, selectedIndex);
      });
    } else if (listContainerRef.current && selectedIndex < 0) {
      requestAnimationFrame(() => {
        if (listContainerRef.current) resetListScroll(listContainerRef.current);
      });
    }
  }, [items, selectedIndex, isLoading, error]);

  return (
    <SplitView
      leftWidth={leftWidth}
      minLeftWidth={minLeftWidth}
      maxLeftWidth={maxLeftWidth}
      left={
        <div
          ref={listContainerRef}
          className="list-panel custom-scrollbar h-full overflow-y-auto p-3 focus:outline-none"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={0}
        >
          {isLoading ? (
            <LoadingState message={loadingMessage} />
          ) : error ? (
            <EmptyState message={'An error occurred'} description={error} />
          ) : list ? (
            list
          ) : (items ?? []).length === 0 ? (
            <EmptyState message={emptyMessage} />
          ) : (
            (items ?? []).map((item, index) => (
              <React.Fragment key={item.id ?? index}>{listItem?.(item, index)}</React.Fragment>
            ))
          )}
        </div>
      }
      right={
        <div className="detail-panel h-full flex flex-col overflow-hidden relative">{detail}</div>
      }
    />
  );
}
