import React, { useEffect, useState, useRef } from 'react';
import {
  clipboardViewState,
  onViewActivated,
  onSearchChanged,
  onScrolledToEnd,
  fetchFullItemForId,
} from './state';
import { clipboardHistoryStore } from '../../services/clipboard/stores/clipboardHistoryStore';
import { listen } from '@tauri-apps/api/event';
import { fetchRawHtml } from './urlFetcher';
import { parseFilePaths, fileNameOf, loadFileThumbnails, FILE_THUMB_DIM } from './filePreview';
import { stripRtf, type ClipboardHistoryItem } from 'asyar-sdk/contracts';
import type { StoredClipboardItem } from '../../lib/ipc/commands';
import { readFile } from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { renderMarkdown, handleMarkdownCopyClick } from '../../utils/markdown';
import { renderMermaidDiagrams } from '../../utils/mermaid';
import SplitListDetail from '../../components/layout/SplitListDetail';
import LauncherListRow from '../../components/list/LauncherListRow';
import { Badge } from '../../components/react/Badge';
import ActionFooter from '../../components/layout/ActionFooter';
import { IconButton } from '../../components/react/Buttons';
import { EmptyState } from '../../components/react/Feedback';
import { searchBarAccessoryService } from '../../services/search/searchBarAccessoryService';
import { feedbackService } from '../../services/feedback/feedbackService';
import { logService } from '../../services/log/logService';

const detailDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

function timeSection(timestamp: number): string {
  const d = new Date(timestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const itemDay = new Date(d);
  itemDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - itemDay.getTime()) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear())
    return 'This month';
  return 'Older';
}

function formatDetailDate(timestamp: number): string {
  return detailDateFormat.format(timestamp);
}

const MAX_PREVIEW_CHARS = 50000;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getSourcePreview(content: string): string {
  if (content.length <= MAX_PREVIEW_CHARS) {
    return escapeHtml(content);
  }
  return escapeHtml(content.substring(0, MAX_PREVIEW_CHARS));
}

function isContentTruncated(content: string): boolean {
  return content.length > MAX_PREVIEW_CHARS;
}

function isUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return /^https?:\/\/[^\s]+$/.test(trimmed) && !trimmed.includes('\n');
}

function getUrlDomain(url: string): string {
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return url.trim();
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClipboardDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [imageLoading, setImageLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [fileThumbnails, setFileThumbnails] = useState<Record<string, string | null>>({});
  const [urlBlobUrl, setUrlBlobUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlFetchFailed, setUrlFetchFailed] = useState(false);
  const [selectedFullItem, setSelectedFullItem] = useState<StoredClipboardItem | null>(null);

  const detailRef = useRef<HTMLDivElement | null>(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const currentImagePathRef = useRef('');
  const currentFilesContentRef = useRef('');
  const currentFetchedUrlRef = useRef('');
  const fileThumbTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync items from store
  const store = clipboardHistoryStore;
  const next = store.searchResults ?? [...store.favorites, ...store.recent];
  clipboardViewState.items = next as unknown as ClipboardHistoryItem[];

  const items = clipboardViewState.filteredItems;
  const selectedId = clipboardViewState.selectedItemId;
  const selectedIndex = items.findIndex((i) => i.id === selectedId);
  const favoritesCount = items.filter((i) => i.favorite).length;

  useEffect(() => {
    void onViewActivated().then(() => rerender());
  }, []);

  useEffect(() => {
    void onSearchChanged(clipboardViewState.searchQuery).then(() => rerender());
  }, [clipboardViewState.searchQuery]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('clipboard:fts-ready', () => {
      clipboardHistoryStore.indexState = 'ready';
      const q = clipboardViewState.searchQuery.trim();
      if (q) void onSearchChanged(q).then(() => rerender());
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const off = searchBarAccessoryService.subscribe(
      'clipboard-history',
      'show-clipboard',
      (value) => {
        clipboardViewState.setTypeFilter(value);
        rerender();
      },
    );
    return off;
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      if (selectedId !== null) {
        clipboardViewState.selectedItemId = null;
        rerender();
      }
      return;
    }
    if (!items.some((i) => i.id === selectedId)) {
      clipboardViewState.selectedItemId = items[0].id;
      rerender();
    }
  }, [items, selectedId]);

  useEffect(() => {
    const id = clipboardViewState.selectedItemId;
    if (!id) {
      setSelectedFullItem(null);
      return;
    }
    fetchFullItemForId(id)
      .then((full) => {
        if (clipboardViewState.selectedItemId === id) {
          setSelectedFullItem(full);
        }
      })
      .catch((err) => {
        feedbackService.report({
          source: 'frontend',
          kind: 'clipboard/get-item-failed',
          severity: 'error',
          retryable: false,
          developerDetail: String(err),
        });
      });
  }, [clipboardViewState.selectedItemId]);

  useEffect(() => {
    if (detailRef.current) {
      renderMermaidDiagrams(detailRef.current);
    }
  }, [selectedFullItem, clipboardViewState.showRenderedHtml]);

  // Image load
  useEffect(() => {
    const item = selectedFullItem;
    if (item?.type === 'image' && item.content && item.content !== currentImagePathRef.current) {
      currentImagePathRef.current = item.content;
      setImageLoading(true);
      readFile(item.content)
        .then((data) => {
          if (!data || data.length === 0) {
            logService.warn(`[ClipboardHistory] Image file is empty: ${item.content}`);
            if (imageUrl) URL.revokeObjectURL(imageUrl);
            setImageUrl('');
            return;
          }
          const blob = new Blob([data], { type: 'image/png' });
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          setImageUrl(URL.createObjectURL(blob));
        })
        .catch((e) => {
          logService.warn(`[ClipboardHistory] Failed to load image: ${e}`);
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          setImageUrl('');
        })
        .finally(() => setImageLoading(false));
    } else if (!item || item.type !== 'image') {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
        setImageUrl('');
      }
      currentImagePathRef.current = '';
      setImageLoading(false);
    }
  }, [selectedFullItem]);

  // File thumbnails
  useEffect(() => {
    const item = selectedFullItem;
    if (!item || item.type !== 'files' || item.redactedKinds?.length) {
      clearTimeout(fileThumbTimerRef.current);
      setFileThumbnails({});
      currentFilesContentRef.current = '';
      return;
    }
    const content = item.content ?? '';
    if (content === currentFilesContentRef.current) return;
    clearTimeout(fileThumbTimerRef.current);
    currentFilesContentRef.current = content;
    setFileThumbnails({});
    const paths = parseFilePaths(content);
    if (paths.length === 0) return;

    fileThumbTimerRef.current = setTimeout(() => {
      void loadFileThumbnails(paths, FILE_THUMB_DIM).then((thumbs) => {
        if (currentFilesContentRef.current === content) setFileThumbnails(thumbs);
      });
    }, 150);

    return () => clearTimeout(fileThumbTimerRef.current);
  }, [selectedFullItem]);

  // URL content fetch
  useEffect(() => {
    const item = selectedFullItem;
    if (
      !item ||
      item.redactedKinds?.length ||
      !isUrl(item.content) ||
      !clipboardViewState.showRenderedHtml
    ) {
      if (currentFetchedUrlRef.current) {
        if (urlBlobUrl) {
          URL.revokeObjectURL(urlBlobUrl);
          setUrlBlobUrl('');
        }
        setUrlLoading(false);
        setUrlFetchFailed(false);
        currentFetchedUrlRef.current = '';
      }
      return;
    }
    const url = item.content!.trim();
    if (url === currentFetchedUrlRef.current) return;
    if (urlBlobUrl) {
      URL.revokeObjectURL(urlBlobUrl);
      setUrlBlobUrl('');
    }
    currentFetchedUrlRef.current = url;
    setUrlFetchFailed(false);
    setUrlLoading(true);

    const network = clipboardViewState.networkService;
    if (!network) {
      setUrlLoading(false);
      setUrlFetchFailed(true);
      return;
    }

    fetchRawHtml(url, network).then((result) => {
      if (currentFetchedUrlRef.current !== url) return;
      if (result.status === 'ok') {
        const blob = new Blob([result.html], { type: 'text/html' });
        setUrlBlobUrl(URL.createObjectURL(blob));
      } else {
        setUrlFetchFailed(true);
      }
      setUrlLoading(false);
    });
  }, [selectedFullItem, clipboardViewState.showRenderedHtml]);

  const selectItem = (id: string) => {
    clipboardViewState.selectedItemId = id;
    rerender();
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey) {
      clipboardViewState.toggleMultiSelect(id);
      rerender();
    } else {
      selectItem(id);
    }
  };

  const pasteItemById = async (id: string) => {
    try {
      const full = await fetchFullItemForId(id);
      if (full) {
        await clipboardViewState.handleItemAction(full as unknown as ClipboardHistoryItem, 'paste');
      }
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'clipboard/paste-failed',
        severity: 'error',
        retryable: false,
        developerDetail: String(err),
      });
    }
  };

  const getItemTitle = (item: { type: string; preview?: string }) => {
    const preview = item.preview ?? '';
    if (!preview)
      return item.type === 'image' ? 'Image' : item.type === 'files' ? 'Files' : 'Empty';
    return preview.substring(0, 200).replace(/\n/g, ' ').trim() || 'Empty';
  };

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      void onScrolledToEnd().then(() => rerender());
    }
  };

  const revealFile = async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (error) {
      logService.error(`Failed to reveal file ${path}: ${error}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not reveal ${path} in explorer` },
      });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {clipboardHistoryStore.indexState === 'indexing' && clipboardViewState.searchQuery.trim() ? (
        <div className="py-1 px-5 text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] text-center shrink-0">
          Indexing… search results will appear when ready
        </div>
      ) : null}

      <div
        className="flex-1 min-h-0 overflow-hidden"
        ref={listWrapperRef}
        onScroll={handleListScroll}
      >
        <SplitListDetail
          leftWidth={260}
          minLeftWidth={200}
          maxLeftWidth={600}
          ariaLabel="Clipboard Items"
          emptyMessage={'No results found'}
          items={items}
          selectedIndex={selectedIndex}
          list={items.map((item, index) => {
            const isSelected = selectedIndex === index;
            const isFirstNonFavorite = index === favoritesCount && index < items.length;
            const prevItem = index > favoritesCount ? items[index - 1] : null;
            const sectionLabel = !item.favorite ? timeSection(item.createdAt) : null;
            const showDayHeader =
              !item.favorite &&
              (isFirstNonFavorite ||
                (prevItem && timeSection(prevItem.createdAt) !== sectionLabel));

            return (
              <React.Fragment key={item.id}>
                {index === 0 && favoritesCount > 0 && (
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                    Pinned
                  </div>
                )}
                {showDayHeader && sectionLabel && (
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                    {sectionLabel}
                  </div>
                )}
                <LauncherListRow
                  data-index={index}
                  selected={isSelected}
                  multiSelected={clipboardViewState.isMultiSelected(item.id)}
                  onClick={(e) => handleRowClick(e, item.id)}
                  onDoubleClick={() => void pasteItemById(item.id)}
                  title={getItemTitle(item)}
                  subtitle={
                    clipboardViewState.searchQuery && 'score' in item
                      ? `Match: ${Math.round((1 - (typeof (item as any).score === 'number' ? (item as any).score : 0)) * 100)}%`
                      : undefined
                  }
                />
              </React.Fragment>
            );
          })}
          detail={
            selectedId ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-auto p-6" ref={detailRef}>
                  {!selectedFullItem ? (
                    <span className="text-[var(--text-tertiary)] text-sm">Loading…</span>
                  ) : !selectedFullItem.content ? (
                    <span className="text-[var(--text-tertiary)] text-sm">
                      No preview available
                    </span>
                  ) : selectedFullItem.type === 'image' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4">
                      {imageLoading ? (
                        <div className="text-xs text-[var(--text-secondary)] opacity-50">
                          Loading image...
                        </div>
                      ) : imageUrl ? (
                        <img
                          src={imageUrl}
                          className="max-w-full max-h-full object-contain rounded-md shadow-sm border border-[var(--border-color)]"
                          alt="Preview"
                          onError={() => {
                            logService.warn(
                              `[ClipboardHistory] Failed to decode image: ${imageUrl}`,
                            );
                            if (imageUrl) URL.revokeObjectURL(imageUrl);
                            setImageUrl('');
                          }}
                        />
                      ) : (
                        <div className="text-xs text-[var(--text-secondary)] opacity-50">
                          Failed to load image
                        </div>
                      )}
                    </div>
                  ) : selectedFullItem.type === 'files' ? (
                    <div className="flex flex-col gap-2 p-4">
                      {parseFilePaths(selectedFullItem.content).map((filePath) => (
                        <div
                          key={filePath}
                          className="flex items-center gap-2 py-1.5 px-2 rounded bg-[var(--bg-secondary)]"
                        >
                          <span className="text-sm font-mono text-[var(--text-primary)] truncate flex-1">
                            {fileNameOf(filePath)}
                          </span>
                          <IconButton
                            onClick={() => void revealFile(filePath)}
                            title="Reveal in Explorer"
                            ariaLabel="Reveal in Explorer"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  ) : clipboardViewState.showRenderedHtml ? (
                    <div
                      className="md-content"
                      onClick={
                        handleMarkdownCopyClick as unknown as React.MouseEventHandler<HTMLDivElement>
                      }
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(selectedFullItem.content),
                      }}
                    />
                  ) : (
                    <pre className="font-mono text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words">
                      {getSourcePreview(selectedFullItem.content)}
                    </pre>
                  )}
                </div>

                <ActionFooter
                  left={
                    <div className="flex items-center space-x-3 text-xs text-[var(--text-secondary)]">
                      {selectedFullItem && (
                        <>
                          <Badge text={selectedFullItem.type} variant="default" mono />
                          <span>{formatDetailDate(selectedFullItem.createdAt)}</span>
                        </>
                      )}
                    </div>
                  }
                />
              </div>
            ) : (
              <EmptyState message={'Select an item to view details'} />
            )
          }
        />
      </div>
    </div>
  );
}
