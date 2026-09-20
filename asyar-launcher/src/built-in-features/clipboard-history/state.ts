import { logService as globalLogService } from '../../services/log/logService';
import {
  type ClipboardHistoryItem,
  type IClipboardHistoryService,
  type INetworkService,
  type ExtensionContext,
  ClipboardItemType,
  stripHtml,
  stripRtf,
} from 'asyar-sdk/contracts';
import { shiftIndex } from '../../lib/listSelection';
import { notifyReact } from '../../lib/reactive';
import { clipboardHistoryStore } from '../../services/clipboard/stores/clipboardHistoryStore';
import { feedbackService } from '../../services/feedback/feedbackService';
import * as commands from '../../lib/ipc/commands';

export class ClipboardViewStateClass {
  /** Plain-text form of the selected item: strips HTML/RTF markup so a
   * snippet prefilled from a rich clipboard item is editable text. */
  async getPlainText(item: ClipboardHistoryItem): Promise<string> {
    let content = item?.content ?? '';
    // List rows can carry previews only; fetch the Rust-decrypted full row
    // when the content itself is missing (e.g. redacted/encrypted entries).
    if (!content && item?.id) {
      const full = await clipboardHistoryStore.fetchFullItem(item.id);
      content = full?.content ?? '';
    }
    if (!content) return '';
    if (item.type === ClipboardItemType.Html) return stripHtml(content);
    if (item.type === ClipboardItemType.Rtf) return stripRtf(content);
    return content;
  }

  searchQuery = '';
  lastSearch = Date.now();
  items: ClipboardHistoryItem[] = [];
  selectedItemId: string | null = null;
  /** Ordered multi-selection (Cmd/Ctrl+Click, Cmd/Ctrl+Arrow) — append-on-add,
   *  independent of the single `selectedItemId` cursor above. Used by
   *  `pasteMergedSelection` to merge-paste in selection order. */
  selectedIds: string[] = [];

  get filteredItems(): ClipboardHistoryItem[] {
    const base = this.items;
    if (this.typeFilter === 'all') return base;
    if (this.typeFilter === 'text')
      return base.filter((i) => i.type === 'text' || i.type === 'html' || i.type === 'rtf');
    if (this.typeFilter === 'images') return base.filter((i) => i.type === 'image');
    if (this.typeFilter === 'files') return base.filter((i) => i.type === 'files');
    return base;
  }

  get selectedIndex(): number {
    if (!this.selectedItemId || !this.filteredItems.length) return 0;
    const idx = this.filteredItems.findIndex((i) => i.id === this.selectedItemId);
    return idx >= 0 ? idx : 0;
  }

  get selectedItem(): ClipboardHistoryItem | null {
    return this.filteredItems[this.selectedIndex] ?? null;
  }

  get multiSelectedItems(): ClipboardHistoryItem[] {
    return this.selectedIds
      .map((id) => this.filteredItems.find((i) => i.id === id))
      .filter((i): i is ClipboardHistoryItem => i != null);
  }

  isLoading = true;
  loadError = false;
  errorMessage = '';
  typeFilter: string = 'all';
  showRenderedHtml: boolean = (() => {
    try {
      const v = localStorage.getItem('clipboard:showRendered');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  })();

  get filtered(): boolean {
    return this.searchQuery.length > 0;
  }

  private clipboardService?: IClipboardHistoryService;
  private logService?: any;
  networkService?: INetworkService;

  initializeServices(context: ExtensionContext) {
    this.clipboardService = context.getService<IClipboardHistoryService>('clipboard');
    this.logService = context.getService('log');
    this.networkService = context.getService<INetworkService>('network');
  }

  setSearch(query: string) {
    this.searchQuery = query;
    this.lastSearch = Date.now();
  }

  setTypeFilter(filter: string) {
    this.typeFilter = filter;
  }

  toggleHtmlView() {
    this.showRenderedHtml = !this.showRenderedHtml;
    try {
      localStorage.setItem('clipboard:showRendered', String(this.showRenderedHtml));
    } catch {}
  }

  toggleMultiSelect(id: string) {
    const idx = this.selectedIds.indexOf(id);
    if (idx >= 0) {
      this.selectedIds = this.selectedIds.filter((x) => x !== id);
    } else {
      this.selectedIds = [...this.selectedIds, id];
      this.selectedItemId = id;
    }
    notifyReact();
  }

  isMultiSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  clearMultiSelect() {
    this.selectedIds = [];
    notifyReact();
  }

  moveSelection(direction: 'up' | 'down') {
    const len = this.filteredItems.length;
    if (len === 0) return;
    const nextIdx = shiftIndex(this.selectedIndex, len, direction);
    this.selectedItemId = this.filteredItems[nextIdx]?.id ?? null;
    notifyReact();
  }

  /** Cmd/Ctrl+Arrow multi-select: move the cursor, then add BOTH the item we
   *  started on and the one we landed on to the ordered selection. Add-only —
   *  moving back over an already-selected item keeps it selected. */
  moveSelectionAndExtend(direction: 'up' | 'down') {
    const prevId = this.selectedItemId;
    this.moveSelection(direction);
    const newId = this.selectedItemId;
    if (!newId || newId === prevId) return;
    const next = [...this.selectedIds];
    if (prevId && !next.includes(prevId)) next.push(prevId);
    if (!next.includes(newId)) next.push(newId);
    this.selectedIds = next;
  }

  /** Merge-paste every multi-selected item in selection order as one text
   *  item. Rust decrypts, strips markup, and joins; non-text items are
   *  skipped and counted. Requires accessibility permission. */
  async pasteMergedSelection(): Promise<void> {
    if (this.selectedIds.length < 2) return;
    const allowed = await commands.checkAccessibilityPermission();
    if (allowed === false) {
      commands.openAccessibilityPreferences();
      return;
    }
    const merged = await commands.clipboardGetMergedText(this.selectedIds);
    if (!merged) {
      this.logService?.error('[clipboard-history] clipboard_get_merged_text failed');
      return;
    }
    if (merged.skippedCount > 0) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'warning',
        retryable: false,
        context: { message: `Skipped ${merged.skippedCount} non-text item(s) in merge paste.` },
      });
    }
    if (!merged.text) {
      if (merged.skippedCount === 0) {
        feedbackService.report({
          source: 'frontend',
          kind: 'manual',
          severity: 'warning',
          retryable: false,
          context: { message: 'Nothing to paste from the current selection.' },
        });
      }
      return;
    }
    await this.clipboardService?.pasteItem({
      id: 'merged',
      type: ClipboardItemType.Text,
      content: merged.text,
      createdAt: Date.now(),
      favorite: false,
    });
    this.selectedIds = [];
    notifyReact();
  }

  async handleItemAction(
    item: ClipboardHistoryItem,
    action: 'paste' | 'copy' | 'delete' | 'favorite',
  ) {
    // Pass a plain copy: items arrive from reactive stores and must not carry
    // proxies across the IPC boundary.
    let plain: ClipboardHistoryItem = { ...item };
    // List-row payloads carry previews only — fetch the full row so
    // paste/copy have real content (mirrors the mouse path in DefaultView).
    if (!plain.content && plain.id && (action === 'paste' || action === 'copy')) {
      const full = await clipboardHistoryStore.fetchFullItem(plain.id);
      if (full) plain = { ...full } as unknown as ClipboardHistoryItem;
    }
    if (action === 'paste') {
      await this.clipboardService?.pasteItem(plain);
    } else if (action === 'copy') {
      // navigator.clipboard is unreliable in the Tauri webview (document
      // focus/permission gating) — prefer the Rust-side clipboard write.
      if (this.clipboardService) {
        await this.clipboardService.writeToClipboard(plain);
      } else {
        await navigator.clipboard.writeText(plain.content ?? '');
      }
    } else if (action === 'delete') {
      await clipboardHistoryStore.deleteHistoryItem(item.id);
    } else if (action === 'favorite') {
      await clipboardHistoryStore.toggleFavorite(item.id);
    }
  }
}

export const clipboardViewState = new ClipboardViewStateClass();

export async function onViewActivated() {
  await clipboardHistoryStore.loadInitial();
}

export async function onSearchChanged(query: string) {
  clipboardViewState.setSearch(query);
  // An empty query means "show everything" — route through clearSearch()
  // so searchResults goes back to null instead of an empty FTS result
  // wiping the initial list right after the view opens.
  if (!query.trim()) {
    clipboardHistoryStore.clearSearch();
    return;
  }
  await clipboardHistoryStore.search(query);
}

export async function onScrolledToEnd() {
  await clipboardHistoryStore.loadOlder();
}

export async function fetchFullItemForId(id: string): Promise<commands.StoredClipboardItem | null> {
  return await commands.clipboardGetItem(id);
}

export const visibleItems = () => clipboardViewState.filteredItems;
