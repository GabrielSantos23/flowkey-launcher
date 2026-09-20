import React from 'react';
import CalcResultCard from './CalcResultCard';
import LauncherListRow from './LauncherListRow';
import { statusForRow } from '../../services/launcher/itemStatusLogic';
import type { MappedSearchItem } from '../../services/search/types/MappedSearchItem';
import { buildSectionedView } from './sectionedListLogic';

export interface SectionedResultsListProps {
  items?: MappedSearchItem[];
  selectedIndex?: number;
  onselect?: (detail: { item: MappedSearchItem }) => void;
}

export default function SectionedResultsList({
  items = [],
  selectedIndex = -1,
  onselect,
}: SectionedResultsListProps) {
  const rows = buildSectionedView(items);

  return (
    <div className="p-2">
      {rows.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <div key={`header-${row.title}-${i}`} className="section-header">
              {row.title}
            </div>
          );
        }

        if (row.item.style === 'large') {
          return (
            <CalcResultCard
              key={row.item.object_id ?? row.item.title + row.originalIndex}
              item={row.item}
              index={row.originalIndex}
              selected={row.originalIndex === selectedIndex}
              onclick={() => onselect?.({ item: row.item })}
            />
          );
        }

        const status = statusForRow(row.item);
        return (
          <LauncherListRow
            key={row.item.object_id ?? row.item.title + row.originalIndex}
            data-index={row.originalIndex}
            selected={row.originalIndex === selectedIndex}
            onClick={() => onselect?.({ item: row.item })}
            icon={row.item.icon}
            title={row.item.title}
            subtitle={row.item.subtitle}
            alias={row.item.alias}
            shortcut={row.item.shortcut}
            typeLabel={row.item.typeLabel}
            status={status}
          />
        );
      })}
    </div>
  );
}
