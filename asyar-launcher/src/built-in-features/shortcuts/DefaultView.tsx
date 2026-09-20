import React, { useEffect, useState } from 'react';
import { shortcutStore, type ItemShortcut } from './shortcutStore';
import { shortcutViewState } from './shortcutViewState';
import { shortcutService } from './shortcutService';
import { toDisplayKeys, normalizeShortcut } from './shortcutFormatter';
import { extensionIframeManager } from '../../services/extension/extensionIframeManager';
import SplitListDetail from '../../components/layout/SplitListDetail';
import LauncherListRow from '../../components/list/LauncherListRow';
import KeyboardHint from '../../components/base/KeyboardHint';
import ShortcutRecorder from '../../components/base/ShortcutRecorder';
import { Badge } from '../../components/react/Badge';
import ActionFooter from '../../components/layout/ActionFooter';
import { EmptyState } from '../../components/react/Feedback';
import { feedbackService } from '../../services/feedback/feedbackService';
import { actionService } from '../../services/action/actionService';
import { ActionContext } from 'asyar-sdk/contracts';

export default function ShortcutsDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [captureModifier, setCaptureModifier] = useState('');
  const [captureKey, setCaptureKey] = useState('');

  const grouped = shortcutViewState.groups;
  const orderedItems = shortcutViewState.orderedItems;
  const selectedIndex = shortcutViewState.selectedIndex;
  const selectedShortcut = shortcutViewState.selectedShortcut;

  useEffect(() => {
    const s = selectedShortcut;
    if (!s) {
      actionService.unregisterAction('shortcuts:remove');
      actionService.unregisterAction('shortcuts:change');
      return;
    }

    actionService.registerAction({
      id: 'shortcuts:change',
      title: 'Change',
      icon: 'icon:pencil',
      extensionId: 'shortcuts',
      category: 'Shortcuts',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        startEdit();
      },
    });

    actionService.registerAction({
      id: 'shortcuts:remove',
      title: 'Remove',
      icon: 'icon:trash',
      extensionId: 'shortcuts',
      category: 'Shortcuts',
      destructive: true,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        await handleRemove(s.objectId, s.itemName);
      },
    });

    return () => {
      actionService.unregisterAction('shortcuts:remove');
      actionService.unregisterAction('shortcuts:change');
    };
  }, [selectedShortcut]);

  useEffect(() => {
    if (mode !== 'edit') return;
    shortcutStore.isCapturing = true;
    extensionIframeManager.hasInputFocus = true;
    (document.activeElement as HTMLElement)?.blur();
    return () => {
      shortcutStore.isCapturing = false;
      extensionIframeManager.hasInputFocus = false;
    };
  }, [mode]);

  const startEdit = () => {
    setCaptureModifier('');
    setCaptureKey('');
    setMode('edit');
  };

  const cancelEdit = () => {
    setMode('view');
  };

  const conflictChecker = async (shortcut: string): Promise<{ name: string } | null> => {
    const conflict = await shortcutService.isConflict(
      normalizeShortcut(shortcut),
      selectedShortcut?.objectId,
    );
    if (conflict) return { name: conflict.itemName };
    return null;
  };

  const handleSave = async (detail: { modifier: string; key: string }): Promise<string | true> => {
    if (!selectedShortcut) return 'No item selected';
    const shortcut = `${detail.modifier}+${detail.key}`;
    const result = await shortcutService.register(
      selectedShortcut.objectId,
      selectedShortcut.itemName,
      selectedShortcut.itemType,
      shortcut,
      selectedShortcut.itemPath,
      selectedShortcut.itemIcon,
    );
    if (!result.ok) {
      const reason = result.conflict?.itemName ?? 'Unsupported key or OS error';
      return `Could not assign: ${reason}`;
    }
    rerender();
    return true;
  };

  const handleRemove = async (id: string, name: string) => {
    const confirmed = await feedbackService.confirmAlert({
      title: 'Remove shortcut',
      message: `Remove the shortcut for "${name}"?`,
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    await shortcutService.unregister(id);
    rerender();
  };

  const shouldShowSectionHeader = (index: number): 'applications' | 'commands' | null => {
    if (orderedItems.length === 0) return null;
    if (index === 0 && grouped.applications.length > 0) return 'applications';
    if (index === grouped.applications.length && grouped.commands.length > 0) return 'commands';
    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SplitListDetail
        ariaLabel="Shortcuts"
        emptyMessage={'No shortcuts configured yet'}
        list={orderedItems.map((s, index) => {
          const section = shouldShowSectionHeader(index);
          return (
            <React.Fragment key={s.objectId}>
              {section === 'applications' && (
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                  Applications
                </div>
              )}
              {section === 'commands' && (
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                  Commands
                </div>
              )}
              <LauncherListRow
                data-index={index}
                selected={selectedIndex === index}
                title={s.itemName}
                onClick={() => {
                  shortcutViewState.setIndex(index);
                  rerender();
                }}
                onDoubleClick={() => startEdit()}
              />
            </React.Fragment>
          );
        })}
        detail={
          mode === 'edit' && selectedShortcut ? (
            <div className="flex flex-col h-full">
              <div className="p-6 pb-0 shrink-0">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                  Assign Shortcut
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  Press the combination you want to use for {selectedShortcut.itemName}.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                <ShortcutRecorder
                  modifier={captureModifier}
                  keyName={captureKey}
                  autoRecord={true}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  onDone={cancelEdit}
                  conflictChecker={conflictChecker}
                />
              </div>
            </div>
          ) : selectedShortcut ? (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar h-full">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] m-0">
                  {selectedShortcut.itemName}
                </h2>
              </div>

              <div className="flex items-center justify-center p-6 bg-[var(--bg-secondary)] rounded-[var(--radius-md)]">
                <KeyboardHint keys={toDisplayKeys(selectedShortcut.shortcut)} />
              </div>

              <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 items-baseline">
                <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                  Type
                </div>
                <div className="text-sm text-[var(--text-primary)]">
                  {selectedShortcut.itemType}
                </div>
                {selectedShortcut.itemPath && (
                  <>
                    <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                      Path
                    </div>
                    <div className="text-sm font-mono text-[var(--text-primary)] break-all">
                      {selectedShortcut.itemPath}
                    </div>
                  </>
                )}
              </div>

              <ActionFooter
                left={
                  <div className="flex items-center gap-3">
                    <Badge text="shortcut" variant="default" mono />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {selectedShortcut.itemType}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {selectedShortcut.itemName}
                    </span>
                  </div>
                }
              />
            </div>
          ) : shortcutStore.shortcuts.length === 0 ? (
            <EmptyState
              message={'No shortcuts configured yet'}
              description={'Use ⌘K on any search result and choose "Assign Shortcut" to add one.'}
            />
          ) : (
            <EmptyState message={'No matching shortcuts'} />
          )
        }
      />
    </div>
  );
}
