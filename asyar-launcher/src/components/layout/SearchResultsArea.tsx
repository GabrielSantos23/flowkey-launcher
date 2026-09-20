import React from 'react';
import SectionedResultsList from '../list/SectionedResultsList';
import ResultsList from '../list/ResultsList';
import { EmptyState } from '../react';
import { logService } from '../../services/log/logService';
import { feedbackService } from '../../services/feedback/feedbackService';

const SEARCH_FATAL_KINDS = new Set(['search_lock_poisoned', 'search_io_failure', 'search_other']);

export interface SearchResultsAreaProps {
  items?: any[];
  selectedIndex: number;
  isSearchLoading: boolean;
  localSearchValue: string;
  listContainerRef?: React.RefObject<HTMLDivElement | null>;
  onselect: (detail: { item: any }) => void;
  showSections?: boolean;
}

export default function SearchResultsArea({
  items = [],
  selectedIndex,
  isSearchLoading,
  localSearchValue,
  listContainerRef,
  onselect,
  showSections = false,
}: SearchResultsAreaProps) {
  const currentFeedback = feedbackService.current;
  const currentItems = items ?? [];

  const handleItemSelect = (detail: { item: any }) => {
    const clickedIndex = currentItems.findIndex(
      (item) =>
        (item.object_id ?? item.objectId) === (detail.item?.object_id ?? detail.item?.objectId),
    );
    if (clickedIndex !== -1) {
      onselect({ item: detail.item });
    } else {
      logService.warn(
        `Clicked item not found in current results: ${detail.item?.object_id ?? detail.item?.objectId ?? 'Unknown'}`,
      );
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <div ref={listContainerRef}>
        {currentFeedback && SEARCH_FATAL_KINDS.has(currentFeedback.kind) ? (
          <EmptyState message={currentFeedback.developerDetail || 'Search error occurred'} />
        ) : currentItems.length > 0 ? (
          showSections ? (
            <SectionedResultsList
              items={currentItems}
              selectedIndex={selectedIndex}
              onselect={handleItemSelect}
            />
          ) : (
            <ResultsList
              items={currentItems}
              selectedIndex={selectedIndex}
              onselect={handleItemSelect}
            />
          )
        ) : localSearchValue && !isSearchLoading ? (
          <EmptyState message={'No results found'} />
        ) : null}
      </div>
    </div>
  );
}
