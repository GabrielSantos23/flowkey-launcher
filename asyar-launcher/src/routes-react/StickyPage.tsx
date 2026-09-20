import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  noteFind,
  noteUpdate,
  stickyClose,
  stickyNew,
  stickyWindowLabel,
} from '../lib/ipc/commands';
import { createWindowDragController } from '../services/launcher/windowDragController';
import '../resources/styles/style.css';

export default function StickyPage() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  const noteIdRef = useRef(noteId);
  const isEditingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  titleRef.current = title;
  bodyRef.current = body;
  noteIdRef.current = noteId;

  const flushSave = () => {
    const id = noteIdRef.current;
    if (!id) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    noteUpdate(id, { title: titleRef.current, body: bodyRef.current }, Date.now()).catch((err) =>
      console.error('[sticky] save failed:', err),
    );
  };

  const scheduleSave = () => {
    const id = noteIdRef.current;
    if (!id) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      flushSave();
    }, 400);
  };

  const load = async (id: string) => {
    const note = await noteFind(id);
    if (!note) {
      setMissing(true);
      setLoaded(true);
      return;
    }
    setTitle(note.title);
    setBody(note.body);
    setLoaded(true);
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      setMissing(true);
      setLoaded(true);
      return;
    }
    setNoteId(id);
    void load(id);

    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    listen<{ id: string }>('notes:changed', (event) => {
      if (event.payload?.id !== id || isEditingRef.current) return;
      void load(id);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    const handleBeforeUnload = () => {
      flushSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      disposed = true;
      flushSave();
      unlisten?.();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const handleClose = async () => {
    flushSave();
    if (noteId) await stickyClose(noteId);
  };

  const handleNewSticky = async () => {
    await stickyNew();
  };

  const drag = noteId ? createWindowDragController(stickyWindowLabel(noteId)) : null;

  const onDragPointerDown = (e: React.PointerEvent) => {
    if (!drag) return;
    drag.onPointerDown(e.nativeEvent);

    const onPointerMove = (ev: PointerEvent) => drag.onPointerMove(ev);
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      drag.onPointerUp();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-md)] overflow-hidden">
      <header
        className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] bg-[var(--bg-secondary)] border-b border-[var(--separator)] shrink-0 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onDragPointerDown}
      >
        <span className="flex-1 self-stretch" />
        <button
          className="shrink-0 border-none bg-transparent text-[var(--text-tertiary)] text-[var(--font-size-md)] leading-none cursor-pointer px-[var(--space-1)] rounded-[var(--radius-xs)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title={'New sticky'}
          onClick={handleNewSticky}
          aria-label={'New sticky'}
        >
          +
        </button>
        <button
          className="shrink-0 border-none bg-transparent text-[var(--text-tertiary)] text-[var(--font-size-md)] leading-none cursor-pointer px-[var(--space-1)] rounded-[var(--radius-xs)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title={'Unstick'}
          onClick={handleClose}
          aria-label={'Unstick'}
        >
          &times;
        </button>
      </header>

      {!loaded ? (
        <div className="p-[var(--space-5)] text-[var(--font-size-sm)] text-[var(--text-tertiary)]">
          {'Loading...'}
        </div>
      ) : missing ? (
        <div className="p-[var(--space-5)] text-[var(--font-size-sm)] text-[var(--text-tertiary)]">
          {'This note no longer exists.'}
        </div>
      ) : (
        <>
          <input
            className="border-none bg-transparent text-[var(--text-primary)] text-[var(--font-size-md)] font-semibold px-[var(--space-4)] pt-[var(--space-3)] pb-[var(--space-1)] shrink-0 outline-none"
            type="text"
            value={title}
            placeholder={'Untitled Note'}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave();
            }}
            onFocus={() => {
              isEditingRef.current = true;
            }}
            onBlur={() => {
              isEditingRef.current = false;
              flushSave();
            }}
          />
          <textarea
            className="flex-1 resize-none border-none bg-transparent text-[var(--text-primary)] text-[var(--font-size-sm)] leading-[1.6] px-[var(--space-4)] pt-[var(--space-2)] pb-[var(--space-4)] outline-none custom-scrollbar"
            value={body}
            placeholder={'Write something…'}
            onChange={(e) => {
              setBody(e.target.value);
              scheduleSave();
            }}
            onFocus={() => {
              isEditingRef.current = true;
            }}
            onBlur={() => {
              isEditingRef.current = false;
              flushSave();
            }}
          />
        </>
      )}
    </div>
  );
}
