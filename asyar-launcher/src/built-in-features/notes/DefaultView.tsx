import React, { useEffect, useState, useRef } from 'react';
import SplitListDetail from '../../components/layout/SplitListDetail';
import LauncherListRow from '../../components/list/LauncherListRow';
import ActionFooter from '../../components/layout/ActionFooter';
import { EmptyState } from '../../components/react/Feedback';
import { Button } from '../../components/react/Buttons';
import { Badge } from '../../components/react/Badge';
import { noteStore, type Note } from './noteStore';
import { noteViewState } from './noteViewState';
import { extractTags, findWikilinkAtCursor } from './noteLinks';
import { noteBacklinks } from '../../lib/ipc/commands';
import WikilinkPicker from './WikilinkPicker';

function previewOf(body: string): string {
  const firstLine = body.split('\n').find((l) => l.trim().length > 0);
  return firstLine?.trim() ?? '';
}

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function relativeTime(ms: number): string {
  const diffSeconds = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return 'just now';
  if (abs < 3600) return relativeFormat.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return relativeFormat.format(Math.round(diffSeconds / 3600), 'hour');
  return relativeFormat.format(Math.round(diffSeconds / 86400), 'day');
}

export default function NotesDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const filteredNotes = noteViewState.getFilteredNotes();
  const selectedIndex = noteViewState.selectedIndex;
  const selectedNote = noteViewState.selectedNote;

  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(null);

  const [wikilinkPickerOpen, setWikilinkPickerOpen] = useState(false);
  const [wikilinkTriggerPos, setWikilinkTriggerPos] = useState(-1);
  const [wikilinkQuery, setWikilinkQuery] = useState('');
  const [backlinks, setBacklinks] = useState<Note[]>([]);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formTitleRef = useRef(formTitle);
  const formBodyRef = useRef(formBody);
  const loadedNoteIdRef = useRef(loadedNoteId);

  formTitleRef.current = formTitle;
  formBodyRef.current = formBody;
  loadedNoteIdRef.current = loadedNoteId;

  const flushSave = () => {
    const id = loadedNoteIdRef.current;
    if (!id) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    noteStore.update(id, { title: formTitleRef.current, body: formBodyRef.current });
  };

  const scheduleSave = () => {
    const id = loadedNoteIdRef.current;
    if (!id) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushSave();
    }, 400);
  };

  useEffect(() => {
    const n = selectedNote;
    if (n && n.id !== loadedNoteId) {
      setFormTitle(n.title);
      setFormBody(n.body);
      setLoadedNoteId(n.id);
      setWikilinkPickerOpen(false);
      if (noteViewState.justCreatedId === n.id) {
        noteViewState.justCreatedId = null;
        requestAnimationFrame(() => titleRef.current?.focus());
      }
    } else if (!n) {
      setLoadedNoteId(null);
    }
  }, [selectedNote, loadedNoteId]);

  useEffect(() => {
    const id = selectedNote?.id ?? null;
    if (!id) {
      setBacklinks([]);
      return;
    }
    noteBacklinks(id).then((rows) => {
      if (selectedNote?.id === id) setBacklinks(rows ?? []);
    });
  }, [selectedNote?.id]);

  useEffect(() => {
    return () => flushSave();
  }, []);

  const jumpToNote = (id: string) => {
    flushSave();
    void noteViewState.selectAfterMutation(id).then(() => rerender());
  };

  const handleBodyInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setFormBody(val);
    scheduleSave();
    const cursorPos = e.target.selectionStart ?? val.length;

    if (wikilinkPickerOpen) {
      if (cursorPos < wikilinkTriggerPos) {
        setWikilinkPickerOpen(false);
        return;
      }
      const slice = val.slice(wikilinkTriggerPos, cursorPos);
      if (slice.includes(']') || slice.includes('\n')) {
        setWikilinkPickerOpen(false);
      } else {
        setWikilinkQuery(slice);
      }
      return;
    }

    const before = val.slice(Math.max(0, cursorPos - 2), cursorPos);
    if (before === '[[') {
      setWikilinkTriggerPos(cursorPos);
      setWikilinkQuery('');
      setWikilinkPickerOpen(true);
    }
  };

  const handleWikilinkInsert = (title: string) => {
    if (!bodyRef.current) return;
    const cursorPos = bodyRef.current.selectionStart ?? wikilinkTriggerPos;
    bodyRef.current.setRangeText(title + ']]', wikilinkTriggerPos, cursorPos, 'end');
    setFormBody(bodyRef.current.value);
    setWikilinkPickerOpen(false);
    scheduleSave();
    bodyRef.current.focus();
  };

  const handleBodyKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return;
    e.preventDefault();
    const cursorPos = bodyRef.current?.selectionStart ?? 0;
    const title = findWikilinkAtCursor(formBody, cursorPos);
    if (!title) return;
    const target = noteStore.notes.find(
      (n) => n.id !== loadedNoteId && n.title.trim().toLowerCase() === title.trim().toLowerCase(),
    );
    if (target) jumpToNote(target.id);
  };

  const tags = extractTags(formBody);
  const wikilinkCandidates = wikilinkPickerOpen
    ? noteStore.notes
        .filter(
          (n) =>
            n.id !== loadedNoteId &&
            n.title.trim() &&
            n.title.toLowerCase().includes(wikilinkQuery.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  const wordCount = formBody.trim() ? formBody.trim().split(/\s+/).length : 0;

  return (
    <div className="h-full flex flex-col">
      <SplitListDetail
        ariaLabel="Notes"
        emptyMessage={
          noteViewState.indexState === 'indexing' ? 'Still indexing your notes…' : 'No notes found'
        }
        list={filteredNotes.map((note, index) => {
          const isSelected = selectedIndex === index;
          return (
            <React.Fragment key={note.id}>
              {index === 0 && noteViewState.pinnedCount > 0 && (
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                  Pinned
                </div>
              )}
              {index === noteViewState.pinnedCount && noteViewState.pinnedCount > 0 && (
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-1 bg-[var(--bg-secondary)]">
                  All Notes
                </div>
              )}
              <LauncherListRow
                data-index={index}
                selected={isSelected}
                title={note.title || 'Untitled Note'}
                subtitle={previewOf(note.body) || undefined}
                onClick={() => {
                  noteViewState.selectItem(index);
                  rerender();
                }}
              />
            </React.Fragment>
          );
        })}
        detail={
          selectedNote ? (
            <div className="flex-1 flex flex-col overflow-hidden p-6 gap-3 h-full">
              <input
                ref={titleRef}
                type="text"
                autoComplete="off"
                className="text-lg font-semibold text-[var(--text-primary)] border-none bg-transparent pb-2 shrink-0 outline-none"
                value={formTitle}
                onChange={(e) => {
                  setFormTitle(e.target.value);
                  scheduleSave();
                }}
                onBlur={flushSave}
                placeholder="Untitled Note"
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  {tags.map((tag) => (
                    <Badge key={tag} text={'#' + tag} variant="default" />
                  ))}
                </div>
              )}
              <div className="flex-1 min-h-0 flex flex-col relative">
                <textarea
                  ref={bodyRef}
                  autoComplete="off"
                  className="flex-1 resize-none border-none bg-transparent text-[var(--text-primary)] text-sm leading-relaxed pb-4 outline-none custom-scrollbar"
                  value={formBody}
                  onChange={handleBodyInput}
                  onKeyDown={handleBodyKeydown}
                  onBlur={flushSave}
                  placeholder="Start writing… Ctrl+Enter follows a [[link]] under the cursor."
                />
                {wikilinkPickerOpen && (
                  <WikilinkPicker
                    candidates={wikilinkCandidates}
                    query={wikilinkQuery}
                    onInsert={handleWikilinkInsert}
                    onClose={() => setWikilinkPickerOpen(false)}
                  />
                )}
              </div>
              {backlinks.length > 0 && (
                <div className="shrink-0 max-h-[140px] overflow-y-auto py-2 border-t border-[var(--separator)]">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                    Linked Mentions
                  </div>
                  {backlinks.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="block w-full text-left bg-transparent border-0 py-1 text-sm text-[var(--asyar-brand)] cursor-pointer hover:underline"
                      onClick={() => jumpToNote(n.id)}
                    >
                      {n.title || 'Untitled Note'}
                    </button>
                  ))}
                </div>
              )}
              <ActionFooter
                left={
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Edited {relativeTime(selectedNote.updatedAt)} · {wordCount}{' '}
                    {wordCount === 1 ? 'word' : 'words'}
                  </span>
                }
              />
            </div>
          ) : (
            <EmptyState message={filteredNotes.length === 0 ? 'No notes yet' : 'Select a note'}>
              {filteredNotes.length === 0 && (
                <Button
                  onClick={() => {
                    void noteViewState.createNote().then(() => rerender());
                  }}
                >
                  Create your first note
                </Button>
              )}
            </EmptyState>
          )
        }
      />
    </div>
  );
}
