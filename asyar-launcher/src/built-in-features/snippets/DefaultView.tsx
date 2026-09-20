import React, { useEffect, useState, useRef } from 'react';
import { snippetStore, type Snippet } from './snippetStore';
import { snippetService, enabledPersistence, processSnippetExpansion } from './snippetService';
import { snippetUiState } from './snippetUiState';
import { snippetViewState } from './snippetViewState';
import SplitListDetail from '../../components/layout/SplitListDetail';
import LauncherListRow from '../../components/list/LauncherListRow';
import { Badge } from '../../components/react/Badge';
import ActionFooter from '../../components/layout/ActionFooter';
import { EmptyState, FormField } from '../../components/react/Feedback';
import { Button } from '../../components/react/Buttons';
import { Input, Textarea } from '../../components/react/Inputs';
import PlaceholderPicker from '../../components/form/PlaceholderPicker';
import { feedbackService } from '../../services/feedback/feedbackService';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function duplicateSnippet(snippet: Snippet) {
  const newId = crypto.randomUUID();
  let newKeyword = snippet.keyword + '-copy';
  const existing = snippetStore.getAll().map((s) => s.keyword);
  let i = 2;
  while (existing.includes(newKeyword)) {
    newKeyword = snippet.keyword + `-copy${i}`;
    i++;
  }
  return {
    id: newId,
    name: snippet.name + ' Copy',
    keyword: newKeyword,
    expansion: snippet.expansion,
    createdAt: Date.now(),
  };
}

export default function SnippetsDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [prefillExpansion, setPrefillExpansion] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formKeyword, setFormKeyword] = useState('');
  const [formExpansion, setFormExpansion] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formId, setFormId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [triggerCursorPos, setTriggerCursorPos] = useState(-1);

  const formExpansionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (snippetUiState.editorTrigger === 'add') {
      setPrefillExpansion(snippetUiState.prefillExpansion);
      snippetUiState.editorTrigger = null;
      snippetUiState.prefillExpansion = null;
      snippetViewState.startCreate();
      rerender();
    }
  }, [snippetUiState.editorTrigger]);

  useEffect(() => {
    if (snippetViewState.mode === 'create') {
      setFormName('');
      setFormKeyword('');
      setFormExpansion(prefillExpansion ?? '');
      setFormError(null);
      setFormId(crypto.randomUUID());
    } else if (snippetViewState.mode === 'edit' && snippetViewState.editingSnippet) {
      const s = snippetViewState.editingSnippet;
      setFormName(s.name);
      setFormKeyword(s.keyword ?? '');
      setFormExpansion(s.expansion);
      setFormError(null);
      setFormId(s.id);
    }
  }, [snippetViewState.mode, snippetViewState.editingSnippet, prefillExpansion]);

  useEffect(() => {
    snippetService.onViewOpen().then(async (result) => {
      const currentEnabled = enabledPersistence.loadSync(true);
      await snippetService.setEnabled(currentEnabled && result.permissionGranted);
    });
  }, []);

  const filteredSnippets = snippetViewState.getFilteredSnippets();
  const selectedIndex = snippetViewState.selectedIndex;
  const selectedSnippet = snippetViewState.selectedSnippet;

  const handleExpansionInput = (val: string) => {
    setFormExpansion(val);
    const input = formExpansionRef.current;
    if (!input) return;
    const cursorPos = input.selectionStart ?? val.length;
    const charBefore = val[cursorPos - 1];

    if (charBefore === '{' && val[cursorPos - 2] !== '{') {
      setTriggerCursorPos(cursorPos);
      setPickerOpen(true);
    } else {
      setPickerOpen(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) {
      setFormError('Snippet name is required');
      return;
    }

    const keyword = formKeyword.trim() || undefined;
    if (keyword) {
      const conflict = snippetStore.findConflict(keyword, formId);
      if (conflict) {
        setFormError(`Keyword "${keyword}" is already used by snippet "${conflict.name}"`);
        return;
      }
    }

    try {
      const saved = await snippetService.upsert({
        id: formId,
        name,
        keyword,
        expansion: formExpansion,
        createdAt: snippetViewState.editingSnippet?.createdAt ?? Date.now(),
      });
      snippetViewState.saveSuccess(saved.id);
      rerender();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save snippet');
    }
  };

  const handleDelete = async () => {
    if (!selectedSnippet) return;
    const deletedId = selectedSnippet.id;
    await snippetService.delete(deletedId);
    snippetViewState.deleteSuccess(deletedId);
    rerender();
  };

  const handleDuplicate = () => {
    if (!selectedSnippet) return;
    const duplicate = duplicateSnippet(selectedSnippet);
    snippetService.upsert(duplicate).then((saved) => {
      snippetViewState.saveSuccess(saved.id);
      rerender();
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SplitListDetail
        ariaLabel="Snippets"
        emptyMessage={'No snippets found'}
        list={filteredSnippets.map((snippet, index) => {
          const isSelected = selectedIndex === index;
          return (
            <React.Fragment key={snippet.id}>
              {index === 0 && snippetViewState.pinnedCount > 0 && (
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                  Pinned
                </div>
              )}
              {index === snippetViewState.pinnedCount && snippetViewState.pinnedCount > 0 && (
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                  All Snippets
                </div>
              )}
              <LauncherListRow
                data-index={index}
                selected={isSelected}
                title={snippet.name}
                subtitle={snippet.keyword ? snippet.keyword : undefined}
                onClick={() => {
                  snippetViewState.selectItem(index);
                  rerender();
                }}
              />
            </React.Fragment>
          );
        })}
        detail={
          snippetViewState.mode === 'edit' || snippetViewState.mode === 'create' ? (
            <div className="flex flex-col h-full">
              <div className="p-6 pb-0 shrink-0">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                  {snippetViewState.mode === 'edit' ? 'Edit Snippet' : 'New Snippet'}
                </h2>
              </div>
              <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 space-y-4">
                {formError && (
                  <div className="text-xs text-[var(--color-danger)] p-2 rounded bg-[var(--color-danger-subtle)]">
                    {formError}
                  </div>
                )}
                <FormField label="Name" id="snippet-name">
                  <Input
                    id="snippet-name"
                    value={formName}
                    onValueChange={setFormName}
                    placeholder="e.g. Email signature"
                    autoFocus
                  />
                </FormField>
                <FormField
                  label="Keyword"
                  hint="Type this prefix to trigger auto-expansion"
                  id="snippet-kw"
                >
                  <Input
                    id="snippet-kw"
                    value={formKeyword}
                    onValueChange={setFormKeyword}
                    placeholder="e.g. :sig"
                  />
                </FormField>
                <div className="relative">
                  <FormField label="Expansion" id="snippet-exp">
                    <Textarea
                      ref={formExpansionRef}
                      id="snippet-exp"
                      value={formExpansion}
                      onValueChange={handleExpansionInput}
                      placeholder="Text to insert..."
                      rows={6}
                    />
                  </FormField>
                  {pickerOpen && (
                    <div className="absolute z-20 bottom-2 left-2">
                      <PlaceholderPicker
                        onSelect={(tag) => {
                          const val = formExpansion;
                          const before = val.slice(0, triggerCursorPos);
                          const after = val.slice(triggerCursorPos);
                          const nextVal = `${before}${tag}${after}`;
                          setFormExpansion(nextVal);
                          setPickerOpen(false);
                        }}
                        onClose={() => setPickerOpen(false)}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      snippetViewState.cancel();
                      rerender();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    Save Snippet
                  </Button>
                </div>
              </form>
            </div>
          ) : selectedSnippet ? (
            <div className="flex flex-col h-full p-6 space-y-6 overflow-y-auto">
              <div className="flex items-start justify-between">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                  {selectedSnippet.name}
                </h2>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={handleDuplicate}>
                    Duplicate
                  </Button>
                  <Button size="sm" variant="danger" onClick={handleDelete}>
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      snippetViewState.startEdit(selectedSnippet);
                      rerender();
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
              {selectedSnippet.keyword && (
                <div className="flex items-center gap-2">
                  <Badge text={selectedSnippet.keyword} variant="default" mono />
                </div>
              )}
              {selectedSnippet.redactedKinds?.length ? (
                <div className="flex items-center gap-3 p-4 bg-[var(--bg-secondary)] rounded-[var(--radius-md)]">
                  <Badge text="Encrypted secret" variant="warning" />
                  <span className="text-xs text-[var(--text-secondary)]">
                    {selectedSnippet.redactedKinds.join(', ')} — expands to the original value
                  </span>
                </div>
              ) : (
                <pre className="font-mono text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words bg-[var(--bg-secondary)] rounded-[var(--radius-sm)] p-4 m-0">
                  {selectedSnippet.expansion}
                </pre>
              )}
              <ActionFooter
                left={
                  <div className="flex items-center gap-3">
                    <Badge text="snippet" variant="default" mono />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {dateFormat.format(selectedSnippet.createdAt)}
                    </span>
                    {!selectedSnippet.redactedKinds?.length && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {selectedSnippet.expansion.length} chars
                      </span>
                    )}
                  </div>
                }
              />
            </div>
          ) : (
            <EmptyState
              message={
                filteredSnippets.length === 0
                  ? 'No snippets found'
                  : 'Select a snippet to view details'
              }
            />
          )
        }
      />
    </div>
  );
}
