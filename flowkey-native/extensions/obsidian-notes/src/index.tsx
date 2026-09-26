import { useEffect, useMemo, useState } from 'react';
import {
  Action,
  ActionPanel,
  List,
  defineReactExtension,
  type CommandProps,
} from '@flowkey-cli/react-ui';
import manifest from '../manifest.json';

// JSON-imported manifests widen `mode` and `type` to string; narrow once here.
const typedManifest = manifest as unknown as import('@flowkey-cli/native-sdk').ExtensionManifest;

interface NoteFile {
  path: string;
  title: string;
  content: string;
  sizeBytes: number;
  createdAtMs: number;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function readingTime(words: number): string {
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

function wordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function obsidianUri(note: NoteFile): string {
  return `obsidian://open?path=${encodeURIComponent(note.path)}`;
}

function markdownLink(note: NoteFile): string {
  return `[${note.title}](${obsidianUri(note)})`;
}

function matchesQuery(note: NoteFile, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = `${note.title}\n${note.content}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function ObsidianView(props: CommandProps) {
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [appendTarget, setAppendTarget] = useState<NoteFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const isPinnedView = props.commandId === 'pinned-notes';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await props.capabilities.fs.glob('**/*.md', { limit: 500 });
        const excludedSetting =
          typeof props.preferences.excludedFolders === 'string' ? props.preferences.excludedFolders : '';
        const excluded = excludedSetting.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean);
        const loadedNotes: NoteFile[] = [];
        for (const entry of entries) {
          if (excluded.some((folder) => entry.path.toLowerCase().includes(`/${folder}/`))) continue;
          const content = await props.capabilities.fs.readText(entry.path);
          loadedNotes.push({
            path: entry.path,
            title: entry.name.replace(/\.md$/, ''),
            content,
            sizeBytes: entry.sizeBytes,
            createdAtMs: entry.createdAtMs,
          });
        }
        if (!cancelled) {
          setNotes(loadedNotes);
          setLoaded(true);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoaded(true);
          setLoadError(String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    props.capabilities.storage
      .get<string[]>('pinned-paths')
      .then((stored) => {
        if (!cancelled && Array.isArray(stored)) setPinned(stored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isPinned = (note: NoteFile) => pinned.includes(note.path);

  const togglePin = async (note: NoteFile) => {
    const next = isPinned(note) ? pinned.filter((p) => p !== note.path) : [...pinned, note.path];
    setPinned(next);
    await props.capabilities.storage.set('pinned-paths', next);
    await props.capabilities.hud.show({ title: isPinned(note) ? 'Unpinned' : 'Pinned', icon: '⭐' });
  };

  const deleteNote = async (note: NoteFile) => {
    await props.capabilities.fs.delete(note.path);
    setNotes(notes.filter((n) => n.path !== note.path));
    const nextPinned = pinned.filter((p) => p !== note.path);
    setPinned(nextPinned);
    await props.capabilities.storage.set('pinned-paths', nextPinned);
    await props.capabilities.hud.show({ title: 'Note deleted', icon: '🗑' });
  };

  const submitAppend = async () => {
    if (!appendTarget) return;
    if (props.query.trim().length === 0) {
      await props.capabilities.hud.show({ title: 'Nothing to append' });
      return;
    }
    await props.capabilities.fs.writeText(appendTarget.path, `\n${props.query}`, { append: true });
    setAppendTarget(null);
    await props.capabilities.hud.show({ title: 'Appended', icon: '📝' });
  };

  const visibleNotes = useMemo(
    () => {
      const base = isPinnedView ? notes.filter((n) => isPinned(n)) : notes;
      return base.filter((note) => matchesQuery(note, props.query));
    },
    [notes, pinned, props.query, isPinnedView],
  );

  if (loadError !== null) {
    const isScopeProblem = loadError.includes('Scope') || loadError.includes('scope');
    return (
      <List>
        <List.EmptyView
          title="Vault unavailable"
          description={isScopeProblem
            ? 'Set the "Path to vault" preference in FlowKey settings for this extension.'
            : loadError}
        />
      </List>
    );
  }

  if (appendTarget) {
    return (
      <List>
        <List.EmptyView
          title={`Append to ${appendTarget.title}`}
          description="Type the text in the search bar, then run Append."
        />
        <List.Item
          id="append-submit"
          title="Append text to note"
          subtitle={appendTarget.title}
          actions={
            <ActionPanel>
              <Action title="Append" primary onAction={submitAppend} />
              <Action
                title="Cancel"
                onAction={async () => {
                  setAppendTarget(null);
                  await props.capabilities.hud.show({ title: 'Append cancelled' });
                }}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const detailFor = (note: NoteFile) => (
    <List.Item.Detail preview={note.content}>
      {props.preferences.showMetadata !== false ? (
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Field label="Character Count" value={String(note.content.length)} />
          <List.Item.Detail.Metadata.Field label="Word Count" value={String(wordCount(note.content))} />
          <List.Item.Detail.Metadata.Field label="Reading Time" value={readingTime(wordCount(note.content))} />
          <List.Item.Detail.Metadata.Field label="Creation Date" value={formatDate(note.createdAtMs)} />
          <List.Item.Detail.Metadata.Field label="File Size" value={formatSize(note.sizeBytes)} />
          <List.Item.Detail.Metadata.Field label="Note Path" value={note.path} />
        </List.Item.Detail.Metadata>
      ) : undefined}
    </List.Item.Detail>
  );

  const actionsFor = (note: NoteFile) => (
    <ActionPanel>
      <Action
        title="Open in Obsidian"
        primary
        onAction={async () => {
          await props.capabilities.shell.openUrl(obsidianUri(note));
        }}
      />
      <Action
        title="Edit Note"
        onAction={async () => {
          await props.capabilities.shell.openPath(note.path);
        }}
      />
      <Action
        title="Append to Note"
        onAction={async () => {
          setAppendTarget(note);
        }}
      />
      <Action
        title="Copy Note Content"
        onAction={async () => {
          await props.capabilities.clipboard.write(note.content);
          await props.capabilities.hud.show({ title: 'Content copied', icon: '📋' });
        }}
      />
      <Action
        title="Paste Note Content"
        onAction={async () => {
          await props.capabilities.clipboard.paste(note.content);
        }}
      />
      <Action
        title="Copy Markdown Link"
        onAction={async () => {
          await props.capabilities.clipboard.write(markdownLink(note));
          await props.capabilities.hud.show({ title: 'Link copied', icon: '🔗' });
        }}
      />
      <Action
        title="Copy Obsidian URI"
        onAction={async () => {
          await props.capabilities.clipboard.write(obsidianUri(note));
          await props.capabilities.hud.show({ title: 'URI copied', icon: '🔗' });
        }}
      />
      <Action
        title="Show in Explorer"
        onAction={async () => {
          await props.capabilities.shell.revealPath(note.path);
        }}
      />
      <Action
        title={isPinned(note) ? 'Unpin Note' : 'Pin Note'}
        onAction={async () => {
          await togglePin(note);
        }}
      />
      <Action
        title="Delete Note"
        onAction={async () => {
          await deleteNote(note);
        }}
      />
    </ActionPanel>
  );

  const itemFor = (note: NoteFile) => (
    <List.Item
      key={note.path}
      id={note.path}
      title={note.title}
      icon={{ lucide: 'file-text', color: '#7C3AED' }}
      detail={detailFor(note)}
      actions={actionsFor(note)}
    />
  );

  const pinnedNotes = visibleNotes.filter((n) => isPinned(n));
  const unpinnedNotes = visibleNotes.filter((n) => !isPinned(n));

  return (
    <List>
      <List.EmptyView
        title={isPinnedView ? 'No pinned notes' : 'No notes found'}
        description={props.query.trim().length > 0 ? 'Nothing matches the search' : undefined}
      />
      {isPinnedView ? (
        <List.Section title="Pinned">{visibleNotes.map(itemFor)}</List.Section>
      ) : (
        <>
          {pinnedNotes.length > 0 ? (
            <List.Section title="Pinned">{pinnedNotes.map(itemFor)}</List.Section>
          ) : undefined}
          <List.Section title="Notes">{unpinnedNotes.map(itemFor)}</List.Section>
        </>
      )}
    </List>
  );
}

export default defineReactExtension({ manifest: typedManifest, component: ObsidianView });
