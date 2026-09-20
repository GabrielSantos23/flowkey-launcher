import React from 'react';
import { useLauncherVersion } from '../../lib/reactive';
import { translateViewState } from './state';
import LauncherListRow from '../../components/list/LauncherListRow';
import SplitListDetail from '../../components/layout/SplitListDetail';
import { EmptyState } from '../../components/react/Feedback';

export default function TranslateDefaultView() {
  useLauncherVersion();

  const { results, selectedIndex, query, isLoading, isShowingDetail, error, selectedItem } =
    translateViewState;

  if (!query.trim()) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 h-full">
        <EmptyState message="Enter text to translate" />
      </div>
    );
  }

  if (isLoading && results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 h-full">
        <EmptyState message="Translating..." />
      </div>
    );
  }

  if (error && results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 h-full">
        <EmptyState message={`Could not translate: ${error}`} />
      </div>
    );
  }

  const renderList = () => (
    <div className="flex flex-col gap-1 p-2">
      {results.map((r, index) => {
        const isSelected = index === selectedIndex;
        const languagesFlow = translateViewState.formatLanguagesFlow(r.langFrom, r.langTo);

        return (
          <LauncherListRow
            key={`${index}-${r.langFrom}-${r.langTo}`}
            selected={isSelected}
            title={r.translatedText}
            trailing={
              <span className="font-medium text-[var(--text-secondary)] shrink-0 ml-auto text-sm">
                {languagesFlow}
              </span>
            }
            onClick={() => {
              translateViewState.selectedIndex = index;
            }}
            onDoubleClick={() => {
              translateViewState.selectedIndex = index;
              translateViewState.copyTranslation(r);
            }}
          />
        );
      })}
    </div>
  );

  if (!isShowingDetail) {
    return <div className="flex-1 overflow-y-auto custom-scrollbar h-full">{renderList()}</div>;
  }

  return (
    <SplitListDetail
      items={results}
      selectedIndex={selectedIndex}
      left={renderList()}
      detail={
        selectedItem ? (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar h-full">
            <div>
              <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                Translation
              </span>
              <p className="text-lg font-medium text-[var(--text-primary)] mt-1 whitespace-pre-wrap select-text">
                {selectedItem.translatedText}
              </p>
            </div>

            {selectedItem.pronunciationText && (
              <div>
                <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                  Pronunciation
                </span>
                <p className="text-sm font-mono text-[var(--text-secondary)] mt-1 select-text">
                  {selectedItem.pronunciationText}
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-[var(--separator)] flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                Language Flow
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                {translateViewState.formatLanguagesFlow(selectedItem.langFrom, selectedItem.langTo)}
              </span>
            </div>

            <div className="pt-2 border-t border-[var(--separator)]">
              <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                Original Text
              </span>
              <p className="text-sm text-[var(--text-secondary)] mt-1 whitespace-pre-wrap select-text">
                {selectedItem.originalText}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState message="No item selected" />
        )
      }
    />
  );
}
