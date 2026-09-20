import React, { useEffect, useState } from 'react';
import { portalStore, type Portal } from './portalStore';
import { portalsUiState } from './index';
import { syncPortalToIndex, removePortalFromIndex, deletePortal } from './portalLifecycle';
import { parseUrlPlaceholders } from '../../lib/placeholders';
import PortalForm from './PortalForm';
import SplitListDetail from '../../components/layout/SplitListDetail';
import LauncherListRow from '../../components/list/LauncherListRow';
import { Badge } from '../../components/react/Badge';
import ActionFooter from '../../components/layout/ActionFooter';
import { EmptyState } from '../../components/react/Feedback';
import { Button } from '../../components/react/Buttons';
import { feedbackService } from '../../services/feedback/feedbackService';
import { actionService } from '../../services/action/actionService';
import { ActionContext } from 'asyar-sdk/contracts';

type Mode = 'view' | 'create' | 'edit';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export default function PortalsDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [mode, setMode] = useState<Mode>('view');
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null);

  useEffect(() => {
    if (portalsUiState.openMode === 'new') {
      setMode('create');
      setEditingPortal(null);
      portalsUiState.openMode = 'list';
      rerender();
    }
  }, [portalsUiState.openMode]);

  const portals = portalStore.portals;
  const selectedIndex = portalsUiState.selectedIndex;
  const selectedPortal =
    selectedIndex >= 0 && selectedIndex < portals.length ? portals[selectedIndex] : null;

  useEffect(() => {
    if (portals.length === 0) {
      portalsUiState.selectedIndex = -1;
    } else if (selectedIndex < 0 || selectedIndex >= portals.length) {
      portalsUiState.selectedIndex = 0;
      rerender();
    }
  }, [portals.length, selectedIndex]);

  useEffect(() => {
    const portal = selectedPortal;
    if (!portal || mode !== 'view') {
      actionService.unregisterAction('portals:edit');
      actionService.unregisterAction('portals:duplicate');
      actionService.unregisterAction('portals:delete');
      return;
    }

    actionService.registerAction({
      id: 'portals:edit',
      title: 'Edit',
      icon: 'icon:pencil',
      extensionId: 'portals',
      category: 'Portals',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        startEdit(portal);
      },
    });

    actionService.registerAction({
      id: 'portals:duplicate',
      title: 'Duplicate',
      icon: 'icon:copy',
      extensionId: 'portals',
      category: 'Portals',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        await handleDuplicate(portal);
      },
    });

    actionService.registerAction({
      id: 'portals:delete',
      title: 'Delete',
      icon: 'icon:trash',
      extensionId: 'portals',
      category: 'Portals',
      destructive: true,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        await handleDelete(portal);
      },
    });

    return () => {
      actionService.unregisterAction('portals:edit');
      actionService.unregisterAction('portals:duplicate');
      actionService.unregisterAction('portals:delete');
    };
  }, [selectedPortal, mode]);

  const startCreate = () => {
    setEditingPortal(null);
    setMode('create');
  };

  const startEdit = (portal: Portal) => {
    setEditingPortal(portal);
    setMode('edit');
  };

  const cancelEdit = () => {
    setMode('view');
    setEditingPortal(null);
  };

  const handleSave = async (portal: Portal) => {
    try {
      if (mode === 'edit' && editingPortal) {
        const editingId = editingPortal.id;
        portalStore.update(editingId, portal);
        await removePortalFromIndex(editingId);
        await syncPortalToIndex({ ...portal, id: editingId });
      } else {
        portalStore.add(portal);
        await syncPortalToIndex(portal);
        const idx = portalStore.portals.findIndex((p) => p.id === portal.id);
        if (idx >= 0) portalsUiState.selectedIndex = idx;
      }
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not save portal: ${err}` },
      });
    } finally {
      cancelEdit();
      rerender();
    }
  };

  const handleDelete = async (portal: Portal) => {
    const confirmed = await feedbackService.confirmAlert({
      title: 'Delete portal',
      message: `Delete "${portal.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deletePortal(portal.id);
      rerender();
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'warning',
        retryable: false,
        context: { message: `Could not fully remove portal: ${err}` },
      });
    }
  };

  const handleDuplicate = async (portal: Portal) => {
    const dup: Portal = {
      ...portal,
      id: crypto.randomUUID(),
      name: portal.name + ' Copy',
      createdAt: Date.now(),
    };
    portalStore.add(dup);
    try {
      await syncPortalToIndex(dup);
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'warning',
        retryable: false,
        context: { message: `Could not index duplicated portal: ${err}` },
      });
    }
    const idx = portalStore.portals.findIndex((p) => p.id === dup.id);
    if (idx >= 0) portalsUiState.selectedIndex = idx;
    rerender();
  };

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (mode !== 'view') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        startCreate();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [mode]);

  const tokens = selectedPortal ? parseUrlPlaceholders(selectedPortal.url) : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SplitListDetail
        ariaLabel="Portals"
        emptyMessage={'No portals yet'}
        list={portals.map((portal, index) => (
          <LauncherListRow
            key={portal.id}
            data-index={index}
            selected={selectedIndex === index}
            title={portal.name}
            subtitle={portal.url}
            onClick={() => {
              portalsUiState.selectedIndex = index;
              rerender();
            }}
          />
        ))}
        detail={
          mode === 'create' || mode === 'edit' ? (
            <div className="flex flex-col h-full">
              <div className="p-6 pb-0 shrink-0">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  {mode === 'edit' ? 'Edit Portal' : 'New Portal'}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                <PortalForm
                  portal={editingPortal ?? undefined}
                  isEditing={mode === 'edit'}
                  onsave={handleSave}
                  oncancel={cancelEdit}
                />
              </div>
            </div>
          ) : selectedPortal ? (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar h-full">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedPortal.icon}</span>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] m-0">
                    {selectedPortal.name}
                  </h2>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                  URL
                </div>
                <pre className="font-mono text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-all bg-[var(--bg-secondary)] rounded-[var(--radius-sm)] p-3 m-0">
                  {selectedPortal.url}
                </pre>
              </div>

              {tokens.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                    Placeholders
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tokens.map((token) => (
                      <Badge key={token} text={token} variant="default" mono />
                    ))}
                  </div>
                </div>
              )}

              <ActionFooter
                left={
                  <div className="flex items-center gap-3">
                    <Badge text="portal" variant="default" mono />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {dateFormat.format(selectedPortal.createdAt)}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {tokens.length} placeholder{tokens.length === 1 ? '' : 's'}
                    </span>
                  </div>
                }
              />
            </div>
          ) : (
            <EmptyState
              message={portals.length === 0 ? 'No portals yet' : 'Select a portal'}
              description={
                portals.length === 0
                  ? 'Create portals to quickly search websites and web apps.'
                  : 'Choose a portal from the left to edit or run it.'
              }
            >
              {portals.length === 0 && <Button onClick={startCreate}>Add your first portal</Button>}
            </EmptyState>
          )
        }
      />
    </div>
  );
}
