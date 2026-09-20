import { searchStores } from '../../services/search/stores/search';
import { contextModeService } from '../../services/context/contextModeService';
import { extensionIframeManager } from '../../services/extension/extensionIframeManager';
import { viewManager } from '../../services/extension/viewManager';
import { searchOrchestrator } from '../../services/search/searchOrchestrator';
import { commandArgumentsService } from '../../services/search/commandArguments';
import { shortcutStore, type ItemShortcut } from '../../built-in-features/shortcuts/shortcutStore';
import { Signal, __activeEffectId } from '../../lib/reactive';
import type { SearchResult } from '../../bindings';
import type { MappedSearchItem } from '../../services/search/types/MappedSearchItem';
import type { ActiveContext, ContextHint } from '../../services/context/contextModeService';

export interface BottomBarHandle {
  isOpen(): boolean;
  closeActionList(): void;
  toggleActionList(): void;
}

export class LauncherState {
  // SvelteKit-mirrored reactive state
  #localSearchValue = new Signal('');
  #contextQuery = new Signal('');
  get localSearchValue(): string {
    return this.#localSearchValue.get();
  }
  set localSearchValue(v: string) {
    this.#localSearchValue.set(v);
  }
  get contextQuery(): string {
    return this.#contextQuery.get();
  }
  set contextQuery(v: string) {
    this.#contextQuery.set(v);
  }
  contextHint: ContextHint | null = null;
  activeContext: ActiveContext | null = null;
  activeContextName = '';
  activeContextIcon = '';
  #mappedSearchResults = new Signal<MappedSearchItem[]>([]);
  selectedItem: MappedSearchItem | null = null;
  selectedActionName: string | null = null;
  selectedActionIcon: string | null = null;
  selectedItemName: string | null = null;
  selectedItemType: string | null = null;
  selectedItemDescription: string | null = null;
  selectedItemExtensionId: string | null = null;
  selectedItemFullShortcut: string | null = null;
  themeName = 'dark';
  windowMode = 'windowed';
  isHoverPaused = false;
  isCompactIdle = false;
  lastActiveViewId: string | null = null;

  // Sync helpers
  get hasActiveContext(): boolean {
    return this.activeContext !== null;
  }

  get showSearchAccessories(): boolean {
    return (
      !this.hasActiveContext &&
      !commandArgumentsService.active &&
      this.searchResultItemsMapped.length > 0
    );
  }

  get isIframeFocused(): boolean {
    return extensionIframeManager.hasInputFocus;
  }

  // ── Legacy derived accessors ────────────────────────────────────────────
  // These were Svelte `$derived` fields; as plain getters they re-read the
  // live source on every access instead of going stale.
  get searchResultItemsMapped(): MappedSearchItem[] {
    return this.#mappedSearchResults.get();
  }
  set searchResultItemsMapped(v: MappedSearchItem[]) {
    console.log(
      'SET mapped',
      v.length,
      new Error().stack?.split(String.fromCharCode(10))[2]?.trim(),
    );
    this.#mappedSearchResults.set(v);
  }
  currentSelectedItemOriginal: SearchResult | null = null;
  assignShortcutTarget: SearchResult | null = null;
  assignAliasTarget: {
    objectId: string;
    name?: string;
    type?: string;
    alias?: string;
  } | null = null;
  get searchItems(): SearchResult[] {
    console.log('GET searchItems activeEffect=', __activeEffectId());
    return searchOrchestrator.items;
  }
  /** Mirrors the live shortcut list for the result mapper. */
  get shortcuts(): ItemShortcut[] {
    return shortcutStore.shortcuts;
  }
  get selectedIndexVal(): number {
    return searchStores.selectedIndex;
  }
  get isSearchLoadingVal(): boolean {
    return searchStores.isLoading;
  }
  get activeViewVal(): string | null {
    return viewManager.activeView;
  }
  get activeViewSearchableVal(): boolean {
    return viewManager.activeViewSearchable;
  }
  get activeViewPlaceholderVal(): string | null {
    return viewManager.activeViewPlaceholder;
  }
  get activeContextChip(): ActiveContext | null {
    return this.activeContext;
  }
  get contextHintChip(): ContextHint | null {
    return this.contextHint;
  }
  get contextActivationIdVal(): string | null {
    return contextModeService.contextActivationId;
  }

  get contextBadge(): { name: string; icon?: string; type?: string } | null {
    if (this.activeContext) {
      return {
        name: this.activeContextName || this.activeContext.provider.display.name,
        icon: this.activeContextIcon || this.activeContext.provider.display.icon,
      };
    }
    return this.contextHint
      ? {
          name: this.contextHint.provider.display.name,
          icon: this.contextHint.provider.display.icon,
          type: this.contextHint.type,
        }
      : null;
  }

  // DOM refs
  #searchInputRef: HTMLInputElement | null = null;
  #listContainerRef: HTMLDivElement | undefined = undefined;
  #bottomBarRef: BottomBarHandle | undefined;

  setSearchInput(el: HTMLInputElement | null) {
    this.#searchInputRef = el;
  }
  setListContainer(el: HTMLDivElement | undefined) {
    this.#listContainerRef = el;
  }
  setBottomBar(bar: BottomBarHandle | undefined) {
    this.#bottomBarRef = bar;
  }
  getSearchInput() {
    return this.#searchInputRef;
  }
  getBottomBar() {
    return this.#bottomBarRef;
  }
  getListContainer() {
    return this.#listContainerRef;
  }

  setupStoreSync() {
    this.localSearchValue = searchStores.query;
  }
}
