import React from 'react';
import CalcResultCard from './CalcResultCard';
import LauncherListRow from './LauncherListRow';
import { statusForRow } from '../../services/launcher/itemStatusLogic';
import type { MappedSearchItem } from '../../services/search/types/MappedSearchItem';

export interface ResultsListProps {
  items?: MappedSearchItem[];
  selectedIndex?: number;
  onselect?: (detail: { item: MappedSearchItem }) => void;
}

export default function ResultsList({
  items = [],
  selectedIndex = -1,
  onselect,
}: ResultsListProps) {
  return (
    <div className="p-2">
      {items.map((item, i) => {
        if (item.style === 'large') {
          return (
            <CalcResultCard
              key={item.object_id ?? item.title + i}
              item={item}
              index={i}
              selected={i === selectedIndex}
              onclick={() => onselect?.({ item })}
            />
          );
        }

        const status = statusForRow(item);
        return (
          <LauncherListRow
            key={item.object_id ?? item.title + i}
            data-index={i}
            selected={i === selectedIndex}
            onClick={() => onselect?.({ item })}
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            alias={item.alias}
            shortcut={item.shortcut}
            typeLabel={item.typeLabel}
            status={status}
          />
        );
      })}
    </div>
  );
}
