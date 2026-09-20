import React, { useEffect, useState } from 'react';
import ListItem from '../../components/list/ListItem';
import { EmptyState } from '../../components/react/Feedback';
import Modal from '../../components/base/Modal';
import { Input } from '../../components/react/Inputs';
import { Button } from '../../components/react/Buttons';
import { windowManagementState } from './state';
import { feedbackService } from '../../services/feedback/feedbackService';
import { applyCustomLayout, deleteLayout, renameLayout } from './layoutLifecycle';
import type { IStorageService } from 'asyar-sdk/contracts';

interface Props {
  store?: IStorageService;
}

export default function WindowManagementManageView({ store }: Props) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [layoutToRename, setLayoutToRename] = useState<any | null>(null);
  const [newLayoutName, setNewLayoutName] = useState('');

  const layouts = windowManagementState.customLayouts;
  const selectedIndex = windowManagementState.selectedIndex;

  useEffect(() => {
    windowManagementState.loadFromStorage(store).then(() => {
      rerender();
    });
  }, [store]);

  const handleApply = async (layout: any) => {
    try {
      await applyCustomLayout(layout, store);
    } catch (e: any) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Failed to apply layout: ${e.message}` },
      });
    }
  };

  const handleDelete = async (layout: any) => {
    const confirmed = await feedbackService.confirmAlert({
      title: 'Delete Layout',
      message: `Are you sure you want to delete "${layout.name}"?`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteLayout(layout.id, store);
      rerender();
    } catch (e: any) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Failed to delete layout: ${e.message}` },
      });
    }
  };

  const handleRenameSubmit = async () => {
    if (!layoutToRename || !newLayoutName.trim()) return;
    try {
      await renameLayout(layoutToRename.id, newLayoutName.trim(), store);
      setRenameModalOpen(false);
      setLayoutToRename(null);
      setNewLayoutName('');
      rerender();
    } catch (e: any) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Failed to rename layout: ${e.message}` },
      });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-[var(--border-color)]">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Custom Window Layouts</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
        {layouts.length === 0 ? (
          <EmptyState
            message="No Custom Layouts"
            description="Save window layouts to quickly arrange your screen."
          />
        ) : (
          layouts.map((layout, index) => (
            <ListItem
              key={layout.id}
              data-index={index}
              selected={selectedIndex === index}
              title={layout.name}
              subtitle={
                layout.bounds ? `${layout.bounds.width}×${layout.bounds.height}` : undefined
              }
              onClick={() => {
                windowManagementState.setIndex(index);
                rerender();
              }}
              onDoubleClick={() => void handleApply(layout)}
              actions={
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayoutToRename(layout);
                      setNewLayoutName(layout.name);
                      setRenameModalOpen(true);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(layout);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              }
            />
          ))
        )}
      </div>

      {renameModalOpen && (
        <Modal
          title="Rename Layout"
          onClose={() => setRenameModalOpen(false)}
          onConfirm={handleRenameSubmit}
        >
          <div className="space-y-4">
            <Input
              value={newLayoutName}
              onValueChange={setNewLayoutName}
              placeholder="Layout name"
              autoFocus
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
