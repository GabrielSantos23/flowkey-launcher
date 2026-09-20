import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { LauncherController } from '../lib/launcher/launcherController';
import ExtensionViewContainer from '../components/extension/ExtensionViewContainer';
import SearchResultsArea from '../components/layout/SearchResultsArea';
import ShortcutCaptureOverlay from '../components/layout/ShortcutCaptureOverlay';
import SearchHeader from '../components/layout/SearchHeader';
import BottomActionBar from '../components/layout/BottomActionBar';
import ActionListPopup from '../components/layout/ActionListPopup';
import ToastHost from '../components/feedback/ToastHost';
import DialogHost from '../components/feedback/DialogHost';
import FatalErrorDialog from '../components/feedback/FatalErrorDialog';
import { isAnyModalOpen } from '../components/base/Modal.logic';
import { createKeyboardHandlers } from '../lib/keyboard/launcherKeyboard';
import { searchStores } from '../services/search/stores/search';
import { searchService } from '../services/search/SearchService';
import { searchOrchestrator } from '../services/search/searchOrchestrator';
import extensionManager from '../services/extension/extensionManager';
import { settingsService } from '../services/settings/settingsService';
import {
  CompactSyncService,
  registerCompactSyncService,
} from '../services/launcher/compactSyncService';
import { feedbackService } from '../services/feedback/feedbackService';
import { logService } from '../services/log/logService';
import { actionService } from '../services/action/actionService';
import { commandArgumentsService } from '../services/search/commandArguments';
import { resolveCommandArguments } from '../lib/ipc/argumentModelCommands';
import { commandArgDefaultsGet } from '../lib/ipc/commandArgDefaultsCommands';
import { argumentHintVersion } from '../lib/launcher/argumentHintVersion';
import type { CommandArgument } from 'asyar-sdk/contracts';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import CrashReportPrompt from '../components/feedback/CrashReportPrompt';
import { crashPromptState } from '../services/feedback/crashPromptState';
import UsageSharePrompt from '../components/feedback/UsageSharePrompt';
import { usageSharePromptState } from '../services/feedback/usageSharePromptState';
import { recordActiveDay } from '../lib/ipc/commands';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { authService } from '../services/auth/authService';
import { runWhenIdle } from '../lib/idle';
import { prewarmEmojiFont } from '../lib/emojiPrewarm';
import type { SearchBarAccessoryDropdownHandle } from '../components/search/SearchBarAccessoryDropdown';
import { useLauncherVersion } from '../lib/reactive';

type ArgHintSchema = {
  args: {
    name: string;
    label: string;
    type: string;
    options?: { value: string; title: string }[];
  }[];
  seeds: Record<string, string>;
};

export default function LauncherPage() {
  // Re-render on any signal change: search results, selection, view state.
  useLauncherVersion();
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const controllerRef = useRef<LauncherController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new LauncherController();
  }
  const controller = controllerRef.current;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const accessoryRef = useRef<SearchBarAccessoryDropdownHandle>(null);

  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);
  const isActionPanelOpenRef = useRef(false);
  const setPanelOpen = (open: boolean) => {
    isActionPanelOpenRef.current = open;
    setIsActionPanelOpen(open);
  };
  const [argHintById, setArgHintById] = useState<Record<string, ArgHintSchema>>({});

  const compactSyncRef = useRef<CompactSyncService | null>(null);
  if (!compactSyncRef.current) {
    compactSyncRef.current = new CompactSyncService({
      getInitialized: () => settingsService.initialized,
      getLaunchView: () => settingsService.currentSettings.appearance.launchView,
      getActiveView: () => controller.activeViewVal,
      getActiveContext: () => controller.activeContext,
      getLocalSearchValue: () => controller.localSearchValue,
      getIsSearchLoading: () => controller.isSearchLoadingVal,
      getCurrentDiagnosticSeverity: () => {
        const severity = feedbackService.current?.severity;
        return severity === 'progress' ? null : (severity ?? null);
      },
      getLastCompletedQuery: () => searchOrchestrator.lastCompletedQuery,
    });
    registerCompactSyncService(compactSyncRef.current);
  }
  const compactSync = compactSyncRef.current;
  const isCompactIdle = compactSync.isCompactIdle;

  useEffect(() => {
    controller.setSearchInput(searchInputRef.current);
    controller.setListContainer(listContainerRef.current ?? undefined);
  });

  const keyboard = createKeyboardHandlers({
    getSearchInput: () => controller.getSearchInput(),
    getLocalSearchValue: () => controller.localSearchValue,
    setLocalSearchValue: (v) => {
      controller.localSearchValue = v;
      searchStores.query = v;
      rerender();
    },
    getContextQuery: () => controller.contextQuery,
    setContextQuery: (v) => {
      controller.contextQuery = v;
      rerender();
    },
    getContextHint: () => controller.contextHint,
    getActiveContext: () => controller.activeContext,
    getSearchResultsLength: () => controller.searchResultItemsMapped.length,
    getSelectedItem: () => {
      const idx = controller.selectedIndexVal;
      const items = controller.searchResultItemsMapped;
      if (idx < 0 || idx >= items.length) return null;
      return items[idx];
    },
    getBottomBar: () => ({
      isOpen: () => isActionPanelOpenRef.current,
      closeActionList: () => setPanelOpen(false),
      toggleActionList: () => setPanelOpen(!isActionPanelOpenRef.current),
    }),
    getAccessoryRef: () => accessoryRef.current,
    handleEnterKey: () => {
      controller.handleEnterKey();
      rerender();
    },
    handleContextDismiss: (clearAll) => {
      controller.handleContextDismiss(clearAll);
      rerender();
    },
    onBeforeHide: async () => {
      await searchService.saveIndex();
    },
    isCompactIdle: () => isCompactIdle,
    onCompactExpand: () => {
      compactSync.compactExpanded = true;
      rerender();
    },
  });

  const handleActionPanelClose = () => {
    setPanelOpen(false);
    if (!controller.assignShortcutTarget && !controller.assignAliasTarget) {
      // Restore after the popup unmounts AND its input stops holding focus —
      // the select variant re-checks focus state at fire time, so fire it at
      // 80ms (the same delay the final-close path uses).
      setTimeout(() => keyboard.restoreSearchFocus({ select: true }), 80);
    }
  };

  useEffect(() => {
    controller.setupEffects();
  }, [controller]);

  useEffect(() => {
    const handleBlur = () => {
      compactSync.compactExpanded = false;
      rerender();
    };
    const handleFocus = () => {
      if (!isAnyModalOpen(document) && !isActionPanelOpen) {
        keyboard.restoreSearchFocus({ select: true });
      }
    };
    document.addEventListener('click', keyboard.maintainSearchFocus, true);
    window.addEventListener('keydown', keyboard.handleGlobalKeydown, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    let unlistenResignKey: UnlistenFn | null = null;
    let unlistenBecomeKey: UnlistenFn | null = null;
    listen('main_panel_did_resign_key', () => {
      if (isActionPanelOpen) {
        setPanelOpen(false);
        keyboard.restoreSearchFocus();
      }
    })
      .then((fn) => {
        unlistenResignKey = fn;
      })
      .catch((e) => logService.debug(`[LauncherPage] listen resign-key failed: ${e}`));

    listen('main_panel_did_become_key', () => {
      if (!isAnyModalOpen(document) && !isActionPanelOpen) {
        keyboard.restoreSearchFocus({ select: true });
      }
    })
      .then((fn) => {
        unlistenBecomeKey = fn;
      })
      .catch((e) => logService.debug(`[LauncherPage] listen become-key failed: ${e}`));

    return () => {
      window.removeEventListener('keydown', keyboard.handleGlobalKeydown, true);
      document.removeEventListener('click', keyboard.maintainSearchFocus, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      unlistenResignKey?.();
      unlistenBecomeKey?.();
    };
  }, [isActionPanelOpen]);

  useEffect(() => {
    compactSync.updateSearchExpandSticky();
    compactSync.syncKeepExpanded();
    compactSync.applyLauncherHeight();
  });

  useEffect(() => {
    runWhenIdle(() => prewarmEmojiFont(), { timeout: 3000 });
    return compactSync.onMount();
  }, [compactSync]);

  useEffect(() => {
    void crashPromptState.load(authService.user?.email ?? undefined);
    const unlistenCrash = listen('crash-report-pending', () => {
      void crashPromptState.load(authService.user?.email ?? undefined);
    });
    unlistenCrash.catch((e) =>
      logService.debug(`[LauncherPage] listen crash-report-pending failed: ${e}`),
    );
    return () => {
      void unlistenCrash.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>('usage:pending-share', (e) => {
      usageSharePromptState.show(e.payload);
      rerender();
    });
    unlisten.catch((e) =>
      logService.debug(`[LauncherPage] listen usage:pending-share failed: ${e}`),
    );
    return () => {
      void unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    void recordActiveDay();
    const promise = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void recordActiveDay();
        if (!isAnyModalOpen(document) && !isActionPanelOpen) {
          keyboard.restoreSearchFocus({ select: true });
        }
      }
    });
    return () => {
      void promise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [isActionPanelOpen]);

  const argumentMode = commandArgumentsService.active;
  const argumentFeedback = commandArgumentsService.feedbackMessage();

  const argumentHint = (() => {
    if (argumentMode || controller.activeViewVal || controller.activeContextChip) return false;
    if (isCompactIdle) return false;
    const idx = controller.selectedIndexVal;
    const items = controller.searchResultItemsMapped;
    if (idx < 0 || idx >= items.length) return false;
    return items[idx].hasArguments === true;
  })();

  const argumentHintObjectId = (() => {
    if (!argumentHint) return null;
    return controller.searchResultItemsMapped[controller.selectedIndexVal]?.object_id ?? null;
  })();

  const argumentCommandName = (() => {
    if (argumentMode) return argumentMode.title;
    if (!argumentHint) return null;
    return controller.searchResultItemsMapped[controller.selectedIndexVal]?.title ?? null;
  })();

  useEffect(() => {
    commandArgumentsService.syncQuery(controller.localSearchValue);
  }, [controller.localSearchValue]);

  const selectedObjectId =
    controller.searchResultItemsMapped[controller.selectedIndexVal]?.object_id ?? null;
  useEffect(() => {
    commandArgumentsService.syncSelection(selectedObjectId);
  }, [selectedObjectId]);

  useEffect(() => {
    if (!argumentHintObjectId || argHintById[argumentHintObjectId]) return;

    let cancelled = false;
    const resolveArgHint = async (id: string) => {
      const resolvedAt = argumentHintVersion();
      try {
        const meta = await extensionManager.getCommandArgMeta(id);
        const declared = meta?.args ?? [];
        const persisted =
          meta && declared.some((a) => a.type === 'dropdown')
            ? ((await commandArgDefaultsGet(
                meta.extensionId,
                meta.commandId,
                meta.isDynamic === true,
              )) ?? {})
            : {};
        const resolved = await resolveCommandArguments({ args: declared, persisted, values: {} });
        const schema: ArgHintSchema = {
          args: declared.map((a) => ({
            name: a.name,
            label: a.placeholder?.trim() || a.name,
            type: a.type,
            options: a.data,
          })),
          seeds: resolved.seeds,
        };
        if (cancelled || argumentHintVersion() !== resolvedAt) return;
        setArgHintById((prev) => ({ ...prev, [id]: schema }));
      } catch {
        // Fallback chip stays
      }
    };

    void resolveArgHint(argumentHintObjectId);
    return () => {
      cancelled = true;
    };
  }, [argumentHintObjectId, argHintById]);

  const argumentHintFields = (() => {
    const id = argumentHintObjectId;
    if (!id) return [];
    const schema = argHintById[id];
    if (!schema) return [];
    const stash = commandArgumentsService.stashFor(id);
    const flagged = commandArgumentsService.flaggedFor(id);
    return schema.args.map((a) => ({
      arg: {
        name: a.name,
        type: a.type,
        placeholder: a.label,
        data: a.options,
      } as CommandArgument,
      value: (stash?.[a.name] ?? schema.seeds[a.name] ?? '').trim(),
      touched: stash?.[a.name] !== undefined,
      needsValue: flagged.has(a.name),
    }));
  })();

  const handleArgHintClick = (fieldIdx: number) => {
    const idx = controller.selectedIndexVal;
    const item = controller.searchResultItemsMapped[idx];
    if (!item) return;
    commandArgumentsService
      .enter(item.object_id)
      .then((ok) => {
        if (ok && fieldIdx > 0) commandArgumentsService.focusField(fieldIdx);
        rerender();
      })
      .catch((err) => {
        logService.error(`Failed to enter argument mode from hint: ${err}`);
      });
  };

  const actionPopupHeaderName = (() => {
    const original = controller.currentSelectedItemOriginal?.name;
    if (original) return original;
    const idx = controller.selectedIndexVal;
    const items = controller.searchResultItemsMapped;
    if (idx >= 0 && idx < items.length) return items[idx].title ?? null;
    return null;
  })();

  const availableActions = actionService.filteredActions.map((action) => ({
    ...action,
    displayCategory:
      action.category ??
      (action.extensionId
        ? (extensionManager.getManifestById(action.extensionId)?.name ?? action.extensionId)
        : null) ??
      'Actions',
  }));

  return (
    <div className="app-root relative w-full">
      <SearchHeader
        inputRef={searchInputRef}
        accessoryRef={accessoryRef}
        value={controller.localSearchValue}
        showBack={!!controller.activeViewVal}
        searchable={!(controller.activeViewVal && !controller.activeViewSearchableVal)}
        placeholder={
          controller.activeViewVal
            ? (controller.activeViewPlaceholderVal ??
              (controller.activeViewSearchableVal ? 'Search...' : 'Press Escape to go back'))
            : 'Search or type a command...'
        }
        activeContext={controller.activeContextChip}
        activeViewId={controller.activeViewVal}
        contextQuery={controller.contextQuery}
        contextHint={controller.contextHintChip}
        argumentMode={argumentMode}
        argumentHint={argumentHint}
        argumentHintFields={argumentHintFields}
        argumentCommandName={argumentCommandName}
        onArgHintClick={handleArgHintClick}
        oninput={(e) => {
          controller.handleSearchInput(e);
          rerender();
        }}
        onkeydown={(e) => {
          keyboard.handleKeydown(e);
          rerender();
        }}
        onclick={() => {
          controller.handleBackClick();
          rerender();
        }}
        oncontextDismiss={() => {
          controller.handleChipDismiss();
          rerender();
        }}
        oncontextQueryChange={(d) => {
          controller.handleContextQueryChange(d);
          rerender();
        }}
        onArgValueChange={(name, v) => {
          commandArgumentsService.setValue(name, v);
          rerender();
        }}
        onArgValueReset={(name) => {
          commandArgumentsService.resetValue(name);
          rerender();
        }}
        onArgFocusField={(idx) => {
          commandArgumentsService.focusField(idx);
          rerender();
        }}
        onArgFieldsBlur={() => {
          commandArgumentsService.blurFields();
          rerender();
        }}
        onArgNext={() => {
          commandArgumentsService.next();
          rerender();
        }}
        onArgPrev={() => {
          commandArgumentsService.prev();
          rerender();
        }}
        onArgSubmit={() => {
          controller.submitArguments();
          rerender();
        }}
        onArgExit={() => {
          commandArgumentsService.exit();
          rerender();
        }}
      />

      <div className="shell-content custom-scrollbar">
        {controller.activeViewVal ? (
          <ExtensionViewContainer
            activeView={controller.activeViewVal}
            extensionManager={extensionManager}
          />
        ) : !isCompactIdle ? (
          <SearchResultsArea
            items={controller.searchResultItemsMapped}
            selectedIndex={controller.selectedIndexVal}
            isSearchLoading={controller.isSearchLoadingVal}
            localSearchValue={controller.localSearchValue}
            showSections={controller.localSearchValue.trim() === ''}
            listContainerRef={listContainerRef}
            onselect={(detail) => {
              if (isCompactIdle) return;
              const clickedIndex = controller.searchResultItemsMapped.findIndex(
                (item) => item.object_id === detail.item.object_id,
              );
              if (clickedIndex !== -1) {
                searchStores.selectedIndex = clickedIndex;
                controller.handleEnterKey();
                rerender();
              }
            }}
          />
        ) : null}
      </div>

      {isActionPanelOpen ? (
        <ActionListPopup
          availableActions={availableActions}
          selectedItemName={actionPopupHeaderName}
          inExtensionView={!!controller.activeViewVal}
          onclose={handleActionPanelClose}
        />
      ) : null}

      <BottomActionBar
        selectedItem={controller.currentSelectedItemOriginal}
        isActionListOpen={isActionPanelOpen}
        isCompactIdle={isCompactIdle}
        argumentValidationError={argumentFeedback}
        onactionListToggled={() => {
          if (isActionPanelOpen) {
            handleActionPanelClose();
          } else {
            actionService.refreshFiltered();
            setPanelOpen(true);
          }
        }}
        onactionListClosed={handleActionPanelClose}
        onexpand={() => {
          compactSync.compactExpanded = true;
          rerender();
        }}
      />

      {controller.assignShortcutTarget ? (
        <ShortcutCaptureOverlay
          target={controller.assignShortcutTarget}
          oncapture={() => {
            controller.assignShortcutTarget = null;
            keyboard.restoreSearchFocus();
            rerender();
          }}
          oncancel={() => {
            controller.assignShortcutTarget = null;
            keyboard.restoreSearchFocus();
            rerender();
          }}
        />
      ) : null}

      <ToastHost />
      <DialogHost />
      <FatalErrorDialog />
      <CrashReportPrompt />
      <UsageSharePrompt />
    </div>
  );
}
