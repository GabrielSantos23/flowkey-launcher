import React, { useEffect, useState, useRef } from 'react';
import { stat } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import SplitListDetail from '../../components/layout/SplitListDetail';
import LauncherListRow from '../../components/list/LauncherListRow';
import { Badge } from '../../components/react/Badge';
import ActionFooter from '../../components/layout/ActionFooter';
import { EmptyState } from '../../components/react/Feedback';
import { searchBarAccessoryService } from '../../services/search/searchBarAccessoryService';
import { logService } from '../../services/log/logService';
import {
  fileSearchViewState,
  runSearch,
  recordSelectionForCurrentQuery,
  type TypeFilter,
} from './state';
import type { FileHit } from 'asyar-sdk/contracts';

import { getFileThumbnail } from '../../lib/ipc/thumbnailCommands';
import { readTextPreview } from '../../lib/ipc/fileSearchCommands';

const ROW_THUMB_DIM = 56;
const DETAIL_THUMB_DIM = 800;
const THUMBNAILABLE_TYPES = new Set(['image', 'audio-video', 'archive', 'other']);

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(modifiedAt: number): string {
  const ageSec = Math.floor(Date.now() / 1000) - modifiedAt;
  if (ageSec < 60) return 'just now';
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)} min ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)} h ago`;
  const days = Math.floor(ageSec / 86400);
  if (days < 30) return `${days} d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}

export default function FileSearchDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [rowThumbnails, setRowThumbnails] = useState<Record<string, string | null>>({});
  const [detailThumbUrl, setDetailThumbUrl] = useState<string | null>(null);
  const [detailTextPreview, setDetailTextPreview] = useState<string | null>(null);
  const [detailFileSize, setDetailFileSize] = useState<number | null>(null);
  const detailTokenRef = useRef(0);
  const rowThumbTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const items = fileSearchViewState.allItems;
  const selectedId = fileSearchViewState.selectedFileId;
  const selectedIndex = items.findIndex((i) => i.fileId === selectedId);
  const selected = items.find((i) => i.fileId === selectedId);
  const pinnedIds = new Set(fileSearchViewState.pinnedFiles.map((p) => p.fileId));

  useEffect(() => {
    const off = searchBarAccessoryService.subscribe(
      'file-search',
      'show-files',
      (value: string) => {
        fileSearchViewState.setTypeFilter(value as TypeFilter);
        void runSearch().then(() => rerender());
      },
    );
    return off;
  }, []);

  useEffect(() => {
    void runSearch().then(() => rerender());
  }, [fileSearchViewState.searchQuery]);

  useEffect(() => {
    clearTimeout(rowThumbTimerRef.current);
    rowThumbTimerRef.current = setTimeout(() => {
      for (const item of items) {
        if (item.type !== 'image' || item.fileId in rowThumbnails) continue;
        void requestRowThumbnail(item.fileId, item.path);
      }
    }, 120);
    return () => clearTimeout(rowThumbTimerRef.current);
  }, [items]);

  const requestRowThumbnail = async (fileId: string, path: string) => {
    try {
      const url = await getFileThumbnail(path, ROW_THUMB_DIM);
      setRowThumbnails((prev) => ({ ...prev, [fileId]: url }));
    } catch (err) {
      logService.warn(`[file-search] Failed to load thumbnail for row ${path}: ${err}`);
      setRowThumbnails((prev) => ({ ...prev, [fileId]: null }));
    }
  };

  const getRowThumbnailUrl = (item: FileHit): string | null => {
    if (item.type !== 'image') return null;
    return rowThumbnails[item.fileId] ?? null;
  };

  useEffect(() => {
    const token = ++detailTokenRef.current;
    setDetailThumbUrl(null);
    setDetailTextPreview(null);
    setDetailFileSize(null);

    if (!selected) return;

    if (THUMBNAILABLE_TYPES.has(selected.type)) {
      getFileThumbnail(selected.path, DETAIL_THUMB_DIM)
        .then((url) => {
          if (token === detailTokenRef.current) setDetailThumbUrl(url);
        })
        .catch((err) => {
          logService.warn(`[file-search] Failed to load detail thumbnail: ${err}`);
        });
    }

    if (selected.type === 'document' || selected.type === 'code' || selected.type === 'text') {
      readTextPreview(selected.path, 160)
        .then((preview) => {
          if (token === detailTokenRef.current) setDetailTextPreview(preview);
        })
        .catch((err) => {
          logService.warn(`[file-search] Failed to load text preview: ${err}`);
        });
    }

    stat(selected.path)
      .then((s) => {
        if (token === detailTokenRef.current) setDetailFileSize(s.size);
      })
      .catch((err) => {
        logService.warn(`[file-search] Failed to stat: ${err}`);
      });
  }, [selected]);

  const handleRowClick = (item: FileHit) => {
    fileSearchViewState.selectedFileId = item.fileId;
    void recordSelectionForCurrentQuery(item.fileId);
    rerender();
  };

  const handleRowDblClick = (item: FileHit) => {
    void openPath(item.path);
  };

  const isHistoryEmpty = fileSearchViewState.searchQuery.trim().length === 0;

  return (
    <div className="h-full flex flex-col">
      <SplitListDetail
        ariaLabel="Files"
        emptyMessage={'No results found'}
        list={
          items.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8">
              <EmptyState message={isHistoryEmpty ? 'No files yet' : 'No matching files'} />
            </div>
          ) : (
            <div className="flex flex-col p-1.5 gap-0.5">
              {items.map((item, index) => {
                const isSelected = index === selectedIndex;
                const isPinned = pinnedIds.has(item.fileId);
                return (
                  <LauncherListRow
                    key={item.fileId}
                    title={item.name}
                    subtitle={item.path}
                    selected={isSelected}
                    onClick={() => handleRowClick(item)}
                    onDoubleClick={() => handleRowDblClick(item)}
                  />
                );
              })}
            </div>
          )
        }
        detail={
          selected ? (
            <div className="p-6 h-full flex flex-col overflow-y-auto">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-2xl shrink-0">
                  {selected.isDir ? '📁' : '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] break-all leading-tight mb-1">
                    {selected.name}
                  </h2>
                  <p className="text-xs text-[var(--text-tertiary)] break-all font-mono leading-relaxed">
                    {selected.path}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 text-xs">
                <div>
                  <span className="text-[var(--text-tertiary)] uppercase tracking-wider text-[10px] font-medium">
                    {'Type'}
                  </span>
                  <div className="mt-1">
                    <Badge text={selected.type} variant="default" />
                  </div>
                </div>

                {detailFileSize !== null && (
                  <div>
                    <span className="text-[var(--text-tertiary)] uppercase tracking-wider text-[10px] font-medium">
                      {'Size'}
                    </span>
                    <div className="mt-1 text-[var(--text-primary)] font-medium">
                      {formatBytes(detailFileSize)}
                    </div>
                  </div>
                )}

                {selected.modifiedAt ? (
                  <div>
                    <span className="text-[var(--text-tertiary)] uppercase tracking-wider text-[10px] font-medium">
                      {'Modified'}
                    </span>
                    <div className="mt-1 text-[var(--text-primary)] font-medium">
                      {formatRelativeTime(selected.modifiedAt)}
                    </div>
                  </div>
                ) : null}

                {detailThumbUrl ? (
                  <div className="mt-2">
                    <span className="text-[var(--text-tertiary)] uppercase tracking-wider text-[10px] font-medium block mb-2">
                      {'Preview'}
                    </span>
                    <div className="rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-center max-h-[300px]">
                      <img
                        src={detailThumbUrl}
                        alt={selected.name}
                        className="max-h-[300px] w-auto object-contain"
                      />
                    </div>
                  </div>
                ) : detailTextPreview ? (
                  <div className="mt-2">
                    <span className="text-[var(--text-tertiary)] uppercase tracking-wider text-[10px] font-medium block mb-2">
                      {'Preview'}
                    </span>
                    <pre className="p-3 rounded-lg bg-[var(--bg-secondary)] font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto border border-[var(--border-color)]">
                      {detailTextPreview}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <EmptyState message={'No file selected'} />
            </div>
          )
        }
      />
      <ActionFooter />
    </div>
  );
}
