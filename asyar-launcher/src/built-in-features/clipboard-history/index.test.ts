/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClipboardItemType } from 'asyar-sdk/contracts';
import extension from './index';
import { clipboardViewState } from './state';

vi.mock('../../services/log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/action/actionService', () => ({
  actionService: {
    registerAction: vi.fn(),
    unregisterAction: vi.fn(),
    setExtensionForwarder: vi.fn(),
  },
}));

vi.mock('../snippets/snippetUiState', () => ({
  snippetUiState: {
    prefillExpansion: null,
    editorTrigger: null,
  },
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('../../services/extension/viewManager', () => ({
  viewManager: {
    goBack: vi.fn(),
  },
}));

vi.mock('../../services/search/stores/search', () => ({
  searchStores: {
    query: '',
    selectedIndex: 0,
    isLoading: false,
  },
}));

vi.mock('../../services/context/contextModeService', () => ({
  contextModeService: {
    activate: vi.fn(),
    updateQuery: vi.fn(),
    pinHint: vi.fn(),
  },
}));

vi.mock('../../services/feedback/feedbackService', () => ({
  feedbackService: {
    report: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../services/run/runService', () => ({ runService: {} }));

vi.mock('./state', () => ({
  clipboardViewState: {
    initializeServices: vi.fn(),
    setSearch: vi.fn(),
    setLoading: vi.fn(),
    setItems: vi.fn(),
    setError: vi.fn(),
    items: [],
    filteredItems: [],
    selectedItem: null,
    moveSelection: vi.fn(),
    moveSelectionAndExtend: vi.fn(),
    handleItemAction: vi.fn(),
    pasteMergedSelection: vi.fn().mockResolvedValue(undefined),
    clearMultiSelect: vi.fn(),
    selectedIds: [] as string[],
    deleteItem: vi.fn().mockResolvedValue(true),
    toggleFavorite: vi.fn().mockResolvedValue(true),
    pasteAsPlainText: vi.fn().mockResolvedValue(undefined),
    typeFilter: 'all',
    showRenderedHtml: false,
    setTypeFilter: vi.fn(),
    toggleHtmlView: vi.fn(),
    getTypeFilteredItems: vi.fn().mockReturnValue([]),
    getPlainText: vi.fn().mockImplementation((item) => {
      if (item.type === ClipboardItemType.Html) return 'stripped html';
      if (item.type === ClipboardItemType.Rtf) return 'stripped rtf';
      return item.content;
    }),
  },
}));

describe('ClipboardHistoryExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes keydown event listener on viewDeactivated', async () => {
    // Setup context
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return {
            setActiveViewActionLabel: vi.fn(),
            navigateToView: vi.fn(),
          };
        }
        if (name === 'clipboard') {
          return {
            getRecentItems: vi.fn().mockResolvedValue([]),
          };
        }
        return {
          info: vi.fn(),
          debug: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
        };
      }),
    };

    // Initialize extension
    await extension.initialize(mockContext as any);

    // Activate view
    await extension.viewActivated('some/path');
    expect(window.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

    const handler = vi
      .mocked(window.addEventListener)
      .mock.calls.find((call) => call[0] === 'keydown')?.[1];

    // Deactivate view
    await extension.viewDeactivated('some/path');

    // This should fail (RED) because viewDeactivated doesn't call removeEventListener currently
    expect(window.removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });
});

describe('Keyboard shortcut: Cmd+Backspace does not delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  it('does not call deleteItem when Cmd+Backspace is pressed with a selected item', async () => {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };

    await extension.initialize(mockContext as any);

    // Set items and selectedItem on the mock
    const mockState = await import('./state');
    (mockState.clipboardViewState as any).items = [{ id: 'test-1', content: 'hello' }];
    (mockState.clipboardViewState as any).filteredItems = [{ id: 'test-1', content: 'hello' }];
    (mockState.clipboardViewState as any).selectedItem = { id: 'test-1', content: 'hello' };

    await extension.viewActivated('some/path');

    // Get the keydown handler
    const handler = vi
      .mocked(window.addEventListener)
      .mock.calls.find((call) => call[0] === 'keydown')?.[1] as EventListener;
    expect(handler).toBeDefined();

    // Simulate Cmd+Backspace
    const event = new KeyboardEvent('keydown', { key: 'Backspace', metaKey: true, bubbles: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);

    // Wait for async
    await new Promise((r) => setTimeout(r, 10));

    expect(mockState.clipboardViewState.deleteItem).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('Keyboard shortcut: Cmd+Arrow extends selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  async function activateWithHandler() {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };
    await extension.initialize(mockContext as any);

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).items = [{ id: 'test-1', content: 'hello' }];
    (mockState.clipboardViewState as any).filteredItems = [{ id: 'test-1', content: 'hello' }];
    (mockState.clipboardViewState as any).selectedItem = { id: 'test-1', content: 'hello' };

    await extension.viewActivated('some/path');
    const handler = vi
      .mocked(window.addEventListener)
      .mock.calls.find((call) => call[0] === 'keydown')?.[1] as EventListener;
    expect(handler).toBeDefined();
    return { handler, mockState };
  }

  it('calls moveSelectionAndExtend("down") on Cmd+ArrowDown, not the plain moveSelection', async () => {
    const { handler, mockState } = await activateWithHandler();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      metaKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);

    expect(mockState.clipboardViewState.moveSelectionAndExtend).toHaveBeenCalledWith('down');
    expect(mockState.clipboardViewState.moveSelection).not.toHaveBeenCalled();
  });

  it('calls moveSelectionAndExtend("up") on Ctrl+ArrowUp', async () => {
    const { handler, mockState } = await activateWithHandler();

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);

    expect(mockState.clipboardViewState.moveSelectionAndExtend).toHaveBeenCalledWith('up');
  });

  it('plain ArrowDown (no modifier) still calls moveSelection, not moveSelectionAndExtend', async () => {
    const { handler, mockState } = await activateWithHandler();

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);

    expect(mockState.clipboardViewState.moveSelection).toHaveBeenCalledWith('down');
    expect(mockState.clipboardViewState.moveSelectionAndExtend).not.toHaveBeenCalled();
  });
});

describe('Keyboard shortcut: Enter routes to merge-paste when multi-selected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  async function activateWithSelection(selectedIds: string[]) {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };
    await extension.initialize(mockContext as any);

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).items = [{ id: 'test-1', content: 'hello' }];
    (mockState.clipboardViewState as any).filteredItems = [{ id: 'test-1', content: 'hello' }];
    (mockState.clipboardViewState as any).selectedItem = { id: 'test-1', content: 'hello' };
    (mockState.clipboardViewState as any).selectedIds = selectedIds;

    await extension.viewActivated('some/path');
    const handler = vi
      .mocked(window.addEventListener)
      .mock.calls.find((call) => call[0] === 'keydown')?.[1] as EventListener;
    return { handler, mockState };
  }

  it('calls pasteMergedSelection when 2+ items are selected', async () => {
    const { handler, mockState } = await activateWithSelection(['a', 'b']);

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockState.clipboardViewState.pasteMergedSelection).toHaveBeenCalled();
    expect(mockState.clipboardViewState.handleItemAction).not.toHaveBeenCalled();
  });

  it('calls handleItemAction (normal paste) when only 1 item is toggled selected', async () => {
    const { handler, mockState } = await activateWithSelection(['test-1']);

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockState.clipboardViewState.handleItemAction).toHaveBeenCalledWith(
      { id: 'test-1', content: 'hello' },
      'paste',
    );
    expect(mockState.clipboardViewState.pasteMergedSelection).not.toHaveBeenCalled();
  });

  it('calls handleItemAction (normal paste) when nothing is multi-selected', async () => {
    const { handler, mockState } = await activateWithSelection([]);

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() });
    handler(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockState.clipboardViewState.handleItemAction).toHaveBeenCalled();
    expect(mockState.clipboardViewState.pasteMergedSelection).not.toHaveBeenCalled();
  });
});

describe('viewActivated clears any stale multi-selection', () => {
  it('calls clipboardViewState.clearMultiSelect() on view activation', async () => {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };
    await extension.initialize(mockContext as any);
    await extension.viewActivated('some/path');

    const mockState = await import('./state');
    expect(mockState.clipboardViewState.clearMultiSelect).toHaveBeenCalled();
  });
});

describe('Action registration', () => {
  it('registers view actions on view activation', async () => {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };

    await extension.initialize(mockContext as any);
    await extension.executeCommand('show-clipboard');

    const { actionService } = await import('../../services/action/actionService');
    const registerCalls = vi.mocked(actionService.registerAction).mock.calls;

    expect(registerCalls.length).toBe(4);

    const actionIds = registerCalls.map((call) => call[0].id);
    expect(actionIds).not.toContain('clipboard-history:filter-all');
    expect(actionIds).not.toContain('clipboard-history:filter-text');
    expect(actionIds).not.toContain('clipboard-history:filter-images');
    expect(actionIds).not.toContain('clipboard-history:filter-files');
    expect(actionIds).toContain('clipboard-history:paste-plain');
    expect(actionIds).toContain('clipboard-history:toggle-favorite');
    expect(actionIds).toContain('clipboard-history:save-as-snippet');
    expect(actionIds).toContain('clipboard-history:delete');
  });

  it('delete action deletes selected item and has destructive flag and shortcut', async () => {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };
    await extension.initialize(mockContext as any);
    await extension.executeCommand('show-clipboard');

    const { actionService } = await import('../../services/action/actionService');
    const deleteAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:delete')?.[0];
    expect(deleteAction).toBeDefined();
    expect(deleteAction?.destructive).toBe(true);
    expect(deleteAction?.shortcut).toBe('Super+Backspace');

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = { id: 'item-1', content: 'test' };

    await deleteAction!.execute();
    expect(mockState.clipboardViewState.handleItemAction).toHaveBeenCalledWith(
      { id: 'item-1', content: 'test' },
      'delete',
    );
  });

  it('actions are unregistered on view deactivation', async () => {
    const mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: vi.fn() };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };
    await extension.initialize(mockContext as any);
    await extension.executeCommand('show-clipboard');
    await extension.viewDeactivated('clipboard-history/DefaultView');

    const { actionService } = await import('../../services/action/actionService');
    expect(actionService.unregisterAction).toHaveBeenCalledWith('clipboard-history:paste-plain');
    expect(actionService.unregisterAction).toHaveBeenCalledWith(
      'clipboard-history:toggle-favorite',
    );
    expect(actionService.unregisterAction).toHaveBeenCalledWith(
      'clipboard-history:save-as-snippet',
    );
    expect(actionService.unregisterAction).toHaveBeenCalledWith('clipboard-history:delete');
  });
});

describe('Save as Snippet action', () => {
  let mockNavigateToView: ReturnType<typeof vi.fn>;
  let mockContext: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');

    const { snippetUiState } = await import('../snippets/snippetUiState');
    snippetUiState.prefillExpansion = null;
    snippetUiState.editorTrigger = null;

    mockNavigateToView = vi.fn();
    mockContext = {
      getService: vi.fn().mockImplementation((name: string) => {
        if (name === 'extensions') {
          return { setActiveViewActionLabel: vi.fn(), navigateToView: mockNavigateToView };
        }
        if (name === 'clipboard') {
          return { getRecentItems: vi.fn().mockResolvedValue([]) };
        }
        return { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
      }),
    };

    await extension.initialize(mockContext as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save-as-snippet action is registered when view activates', async () => {
    await extension.executeCommand('show-clipboard');

    const { actionService } = await import('../../services/action/actionService');
    const registerCalls = vi.mocked(actionService.registerAction).mock.calls;
    const actionIds = registerCalls.map((call) => call[0].id);
    expect(actionIds).toContain('clipboard-history:save-as-snippet');
  });

  it('save-as-snippet action is unregistered when view deactivates', async () => {
    await extension.executeCommand('show-clipboard');
    await extension.viewDeactivated('clipboard-history/DefaultView');

    const { actionService } = await import('../../services/action/actionService');
    expect(actionService.unregisterAction).toHaveBeenCalledWith(
      'clipboard-history:save-as-snippet',
    );
  });

  it('execute() sets snippetUiState.prefillExpansion to the selected item content', async () => {
    await extension.executeCommand('show-clipboard');

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'test-1',
      type: ClipboardItemType.Text,
      content: 'Hello from clipboard',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const registerCalls = vi.mocked(actionService.registerAction).mock.calls;
    const saveAction = registerCalls.find(
      (c) => c[0].id === 'clipboard-history:save-as-snippet',
    )?.[0];
    expect(saveAction).toBeDefined();

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.prefillExpansion).toBe('Hello from clipboard');
  });

  it('execute() sets snippetUiState.editorTrigger to add', async () => {
    await extension.executeCommand('show-clipboard');

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'test-1',
      type: ClipboardItemType.Text,
      content: 'some text',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.editorTrigger).toBe('add');
  });

  it('execute() calls navigateToView with snippets/DefaultView', async () => {
    await extension.executeCommand('show-clipboard');

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'test-1',
      type: ClipboardItemType.Text,
      content: 'some text',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    expect(mockNavigateToView).toHaveBeenCalledWith('snippets/DefaultView');
  });

  it('execute() does nothing if selected item type is Image', async () => {
    await extension.executeCommand('show-clipboard');
    mockNavigateToView.mockClear();

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'img-1',
      type: ClipboardItemType.Image,
      content: '/path/to/image.png',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.prefillExpansion).toBe(null);
    expect(mockNavigateToView).not.toHaveBeenCalled();
  });

  it('execute() does nothing if selected item type is Files', async () => {
    await extension.executeCommand('show-clipboard');
    mockNavigateToView.mockClear();

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'files-1',
      type: ClipboardItemType.Files,
      content: '["/a.txt"]',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.prefillExpansion).toBe(null);
    expect(mockNavigateToView).not.toHaveBeenCalled();
  });

  it('execute() does nothing if no item is selected', async () => {
    await extension.executeCommand('show-clipboard');
    mockNavigateToView.mockClear();

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = null;

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.prefillExpansion).toBe(null);
    expect(mockNavigateToView).not.toHaveBeenCalled();
  });

  it('execute() passes HTML-stripped plain text as prefillExpansion when item type is Html', async () => {
    await extension.executeCommand('show-clipboard');

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'html-1',
      type: ClipboardItemType.Html,
      content: '<b>html content</b>',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.prefillExpansion).toBe('stripped html');
    expect(mockNavigateToView).toHaveBeenCalled();
  });

  it('execute() works for Rtf type items', async () => {
    await extension.executeCommand('show-clipboard');

    const mockState = await import('./state');
    (mockState.clipboardViewState as any).selectedItem = {
      id: 'rtf-1',
      type: ClipboardItemType.Rtf,
      content: '{\\rtf content}',
      createdAt: Date.now(),
      favorite: false,
    };

    const { actionService } = await import('../../services/action/actionService');
    const saveAction = vi
      .mocked(actionService.registerAction)
      .mock.calls.find((c) => c[0].id === 'clipboard-history:save-as-snippet')?.[0];

    await saveAction!.execute();

    const { snippetUiState } = await import('../snippets/snippetUiState');
    expect(snippetUiState.prefillExpansion).toBe('stripped rtf');
    expect(mockNavigateToView).toHaveBeenCalled();
  });
});
