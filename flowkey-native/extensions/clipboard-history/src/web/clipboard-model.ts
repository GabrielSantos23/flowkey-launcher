import type { IconName } from './icons';
import type { ClipboardEntry, ClipboardKind } from './context';

const TYPE_LABELS: Record<ClipboardKind, string> = {
  text: 'Text',
  link: 'Link',
  email: 'Email Address',
  file: 'File',
  image: 'Image',
  color: 'Color',
};

const KIND_ICONS: Record<ClipboardKind, IconName> = {
  text: 'file-text',
  link: 'link',
  email: 'at-sign',
  file: 'file',
  image: 'image',
  color: 'square',
};

export function typeLabel(kind: ClipboardKind): string {
  return TYPE_LABELS[kind] ?? 'Text';
}

export function kindIcon(kind: ClipboardKind): IconName {
  return KIND_ICONS[kind] ?? 'file-text';
}

/** Single-line list preview: whitespace collapsed, capped, empty-safe. */
export function previewText(entry: ClipboardEntry, maxChars = 120): string {
  if (entry.kind === 'image') {
    return entry.width > 0 && entry.height > 0 ? `Image (${entry.width}×${entry.height})` : 'Image';
  }
  if (entry.kind === 'file') {
    const count = entry.text.length === 0 ? 0 : entry.text.split('\n').length;
    return count === 1 ? '1 file' : `${count} files`;
  }
  const collapsed = entry.text.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) {
    return '(empty)';
  }
  return collapsed.length <= maxChars ? collapsed : collapsed.slice(0, maxChars) + '…';
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", a weekday inside the last week, or a calendar date. */
export function dayLabel(timestampMs: number, nowMs: number): string {
  const today = startOfDay(nowMs);
  const day = startOfDay(timestampMs);
  const daysAgo = Math.round((today - day) / DAY_MS);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) {
    return new Date(timestampMs).toLocaleDateString(undefined, { weekday: 'long' });
  }
  const sameYear = new Date(timestampMs).getFullYear() === new Date(nowMs).getFullYear();
  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export interface EntrySection {
  id: string;
  title: string;
  entries: ClipboardEntry[];
}

/** Groups newest-first entries into consecutive calendar-day sections. */
export function entrySections(entries: ClipboardEntry[], nowMs: number): EntrySection[] {
  const sections: EntrySection[] = [];
  for (const entry of entries) {
    const title = dayLabel(entry.timestamp, nowMs);
    const current = sections[sections.length - 1];
    if (current && current.title === title) {
      current.entries.push(entry);
    } else {
      sections.push({ id: `${title}-${sections.length}`, title, entries: [entry] });
    }
  }
  return sections;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** True when a #RGB/#RRGGBB hex is a light color (dark label text on it). */
export function isLightColor(hex: string): boolean {
  const value = hex.trim();
  const digits = value.startsWith('#') ? value.slice(1) : value;
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : digits;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    return false;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** "Today at 9:29:46 PM" style, matching the shell's locale. */
export function formatCopiedTime(timestampMs: number, nowMs: number): string {
  const time = new Date(timestampMs).toLocaleTimeString();
  const day = dayLabel(timestampMs, nowMs);
  return day === 'Today' || day === 'Yesterday' ? `${day} at ${time}` : `${day}, ${time}`;
}

export interface DetailField {
  label: string;
  value: string;
}

/** The Information pane rows for one entry (the Copied time is page-level). */
export function detailFields(entry: ClipboardEntry): DetailField[] {
  const fields: DetailField[] = [
    { label: 'Source', value: entry.source ?? 'Unknown' },
    { label: 'Type', value: typeLabel(entry.kind) },
  ];
  if (entry.kind === 'image') {
    fields.push({ label: 'Dimensions', value: `${entry.width}×${entry.height}` });
  } else if (entry.kind === 'file') {
    const count = entry.text.length === 0 ? 0 : entry.text.split('\n').length;
    fields.push({ label: 'Files', value: String(count) });
  } else {
    fields.push({ label: 'Characters', value: String(entry.text.length) });
  }
  fields.push({ label: 'Size', value: formatBytes(entry.sizeBytes) });
  return fields;
}

/** Panel actions offered for the selected entry, in palette order. */
export function actionsForSelection(): Array<{ id: string; title: string; icon: IconName }> {
  return [
    { id: 'paste', title: 'Paste', icon: 'clipboard-paste' },
    { id: 'copy', title: 'Copy to Clipboard', icon: 'copy' },
    { id: 'edit', title: 'Edit', icon: 'pencil' },
    { id: 'delete', title: 'Remove from History', icon: 'trash-2' },
  ];
}

/** The row the list should select after `previous` disappears. */
export function selectionAfterRemoval(
  entries: ClipboardEntry[],
  previousId: string | null,
): string | null {
  const fresh = entries.filter((entry) => entry.id !== previousId);
  if (fresh.length === 0) {
    return null;
  }
  if (previousId === null) {
    return fresh[0].id;
  }
  const at = entries.findIndex((entry) => entry.id === previousId);
  if (at === -1) {
    return fresh[0].id;
  }
  // the entry that took the removed one's place
  return fresh[Math.min(at, fresh.length - 1)].id;
}

/** Keeps the selection when it still exists, otherwise falls back to the top. */
export function selectionForEntries(
  entries: ClipboardEntry[],
  selectedId: string | null,
): string | null {
  if (entries.length === 0) {
    return null;
  }
  return entries.some((entry) => entry.id === selectedId) ? selectedId : entries[0].id;
}
