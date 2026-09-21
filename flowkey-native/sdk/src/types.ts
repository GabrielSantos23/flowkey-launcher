export const PROTOCOL_VERSION = 1;

export interface UiAction {
  id: string;
  title: string;
  primary?: boolean;
}

export interface UiPaneField {
  label: string;
  value: string;
  valueIconUri?: string;
}

export interface UiPane {
  title?: string;
  preview?: string;
  previewImageUri?: string;
  fields?: UiPaneField[];
}

export interface UiItem {
  id: string;
  title: string;
  subtitle?: string;
  kind?: string;
  icon?: string;
  iconName?: string;
  iconColor?: string;
  iconUri?: string;
  pane?: UiPane;
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

export interface UiFilterOption {
  label: string;
  value: string;
}

export interface ListTree {
  type: 'list';
  layout?: string;
  filter?: { options: UiFilterOption[] };
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
  description?: string;
  actions?: UiAction[];
}

export interface GridTree {
  type: 'grid';
  title?: string;
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
  commands: {
    id: string;
    title: string;
    keywords?: string[];
    mode?: 'view' | 'background';
    icon?: string;
    iconColor?: string;
  }[];
  nativeMethods: string[];
  httpHosts: string[];
}

export type Preferences = Record<string, unknown>;

export interface ExtensionContext {
  preferences: Preferences;
  commandId?: string;
  filterValue?: string;
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
  command?(commandId: string, ctx: ExtensionContext): Promise<void>;
  detail?(item: UiItem, ctx: ExtensionContext): Promise<DetailTree>;
  grid?(query: string, ctx: ExtensionContext): Promise<GridTree>;
}

export interface ExtensionModule {
  manifest: ExtensionManifest;
  handlers: SearchHandlers;
}

export interface PreferenceSchema {
  name: string;
  type: 'text' | 'password' | 'checkbox' | 'dropdown';
  title: string;
  default?: string | boolean;
  required?: boolean;
  options?: { value: string; title: string }[];
}

export interface ReadyExtension {
  id: string;
  name: string;
  version: string;
  icon?: string;
  preferences?: PreferenceSchema[];
  commands: {
    id: string;
    title: string;
    keywords?: string[];
    mode?: 'view' | 'background';
    icon?: string;
    iconColor?: string;
  }[];
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
  commandId?: string;
  filterValue?: string;
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

export interface AckMessage {
  type: 'ack';
  requestId: string;
}

export interface LogMessage {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

export type SidecarMessage =
  ReadyMessage | UiMessage | ErrorMessage | AckMessage | NativeCallMessage | LogMessage;

export function defineExtension(module: ExtensionModule): ExtensionModule {
  return module;
}
