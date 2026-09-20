export const PROTOCOL_VERSION = 1;

export interface UiAction {
  id: string;
  title: string;
  primary?: boolean;
}

export interface UiItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: UiAction[];
}

export interface UiEmptyView {
  title: string;
  description?: string;
}

export interface UiSection {
  title?: string;
  items: UiItem[];
}

export interface ListTree {
  type: 'list';
  sections: UiSection[];
  emptyView?: UiEmptyView;
}

export interface UiField {
  label: string;
  value: string;
}

export interface DetailTree {
  type: 'detail';
  title: string;
  fields: UiField[];
  actions?: UiAction[];
}

export interface GridTree {
  type: 'grid';
  columns: number;
  items: UiItem[];
  emptyView?: UiEmptyView;
}

export type UiTree = ListTree | DetailTree | GridTree;

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  commands: { id: string; title: string }[];
  nativeMethods: string[];
  httpHosts: string[];
}

export type Preferences = Record<string, unknown>;

export interface ExtensionContext {
  preferences: Preferences;
  native: {
    call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  };
}

export interface SearchHandlers {
  search(query: string, ctx: ExtensionContext): Promise<UiTree>;
  onAction?(
    actionId: string,
    item: UiItem | undefined,
    ctx: ExtensionContext,
  ): Promise<UiTree | null>;
  detail?(item: UiItem, ctx: ExtensionContext): Promise<DetailTree>;
  grid?(query: string, ctx: ExtensionContext): Promise<GridTree>;
}

export interface ExtensionModule {
  manifest: ExtensionManifest;
  handlers: SearchHandlers;
}

export interface ReadyExtension {
  id: string;
  name: string;
  version: string;
  commands: { id: string; title: string }[];
  nativeMethods: string[];
  httpHosts: string[];
}

export interface InitMessage {
  type: 'init';
  protocolVersion: number;
  extensionsDir: string;
  preferences: Record<string, Preferences>;
}

export interface SearchMessage {
  type: 'search';
  requestId: string;
  extensionId: string;
  query: string;
}

export interface ActionMessage {
  type: 'action';
  requestId: string;
  extensionId: string;
  actionId: string;
  item?: UiItem;
}

export interface PreferencesMessage {
  type: 'preferences';
  extensionId: string;
  values: Preferences;
}

export type HostMessage =
  InitMessage | SearchMessage | ActionMessage | PreferencesMessage | NativeResultMessage;

export interface ReadyMessage {
  type: 'ready';
  protocolVersion: number;
  extensions: ReadyExtension[];
}

export interface UiMessage {
  type: 'ui';
  requestId: string;
  tree: UiTree;
}

export interface ErrorMessage {
  type: 'error';
  requestId: string;
  error: { code: string; message: string };
}

export interface NativeCallMessage {
  type: 'nativeCall';
  requestId: string;
  extensionId: string;
  method: string;
  params?: Record<string, unknown>;
}

export type NativeResultMessage =
  | {
      type: 'nativeResult';
      requestId: string;
      ok: true;
      result?: unknown;
    }
  | {
      type: 'nativeResult';
      requestId: string;
      ok: false;
      error: { code: string; message: string };
    };

export interface LogMessage {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

export type SidecarMessage =
  ReadyMessage | UiMessage | ErrorMessage | NativeCallMessage | NativeResultMessage | LogMessage;

export function defineExtension(module: ExtensionModule): ExtensionModule {
  return module;
}
