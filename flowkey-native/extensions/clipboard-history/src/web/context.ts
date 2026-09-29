import type { IconName } from './icons';
import type { ScrollIntent } from './scroll';

export type ClipboardKind = 'text' | 'link' | 'email' | 'file' | 'image' | 'color';

/** One `clipboard.history` item, with the shell's rewritten preview URIs. */
export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: number;
  kind: ClipboardKind;
  iconUri: string | null;
  previewImageUri: string | null;
  source: string | null;
  sourceIconUri: string | null;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface PanelActionDef {
  id: string;
  title: string;
  icon: IconName;
}

export interface ViewController {
  primaryTitle: string;
  primary: () => void;
  actions: PanelActionDef[];
  selectedId: string | null;
  select: (id: string) => void;
  move: (delta: 1 | -1) => void;
  scroll: (intent: ScrollIntent) => boolean;
}
