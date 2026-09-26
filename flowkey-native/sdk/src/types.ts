import type { FlowKeyCapabilities } from './capabilities';

export const PROTOCOL_VERSION = 1;

export interface UiAction {
  id: string;
  title: string;
  primary?: boolean;
  push?: string;
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
  /** Raw SVG markup rendered as a vector (tinted by `iconColor`). */
  iconSvg?: string;
  pane?: UiPane;
  actions?: UiAction[];
}

export interface UiEmptyView {
  title: string;
  description?: string;
}

export interface UiSection {
  title?: string;
  subtitle?: string;
  items: UiItem[];
}

export interface UiFilter {
  options: UiFilterOption[];
}

export interface UiFilterOption {
  label: string;
  value: string;
}

export interface ListTree {
  type: 'list';
  layout?: string;
  filter?: UiFilter;
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
  mediaKeys?: boolean;
  subtitle?: string;
  imageUri?: string;
  fields: UiField[];
  description?: string;
  actions?: UiAction[];
}

export interface GridTree {
  type: 'grid';
  title?: string;
  columns: number;
  /** Flat item list; ignored when `sections` is present. */
  items: UiItem[];
  /** Grouped items with optional headers (rendered as header rows). */
  sections?: UiSection[];
  /** Search-bar dropdown options shown while this grid view is open. */
  filter?: UiFilter;
  emptyView?: UiEmptyView;
}

export type UiTree = ListTree | DetailTree | GridTree;

export interface ManifestCommand {
  id: string;
  title: string;
  keywords?: string[];
  mode?: 'view' | 'background';
  icon?: string;
  iconColor?: string;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  /**
   * Bundled JavaScript entry file that the sidecar imports at runtime,
   * relative to the package root. Defaults to 'main.js'.
   */
  entry?: string;
  commands: ManifestCommand[];
  nativeMethods: string[];
  httpHosts: string[];
  oauth?: string[];
  preferences?: PreferenceSchema[];
}

export type Preferences = Record<string, unknown>;

export interface HudOptions {
  title: string;
  icon?: string;
  duration?: number;
}

export interface ExtensionContext {
  preferences: Preferences;
  commandId?: string;
  filterValue?: string;
  native: {
    call<T = unknown>(
      method: string,
      params?: Record<string, unknown>,
      options?: { signal?: AbortSignal; timeoutMs?: number },
    ): Promise<T>;
    showHud(options: HudOptions): Promise<void>;
  };
  /** Typed capability groups over `native.call` (http, storage, clipboard, …). */
  capabilities: FlowKeyCapabilities;
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
  description?: string;
  default?: string | boolean;
  required?: boolean;
  options?: { value: string; title: string }[];
}

export interface ReadyExtension {
  id: string;
  name: string;
  version: string;
  icon?: string;
  description?: string;
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
  oauth?: string[];
}

export interface InitMessage {
  type: 'init';
  protocolVersion: number;
  extensionsDir: string;
  preferences: Record<string, Preferences>;
  /** Installed extension ids the shell has disabled; the sidecar must not load them. */
  disabledExtensions?: string[];
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

export interface ReadyFailure {
  id: string;
  message: string;
}

export interface ReadyMessage {
  type: 'ready';
  protocolVersion: number;
  extensions: ReadyExtension[];
  /** Installed extensions that were discovered but failed to load. */
  failures?: ReadyFailure[];
}

export interface UiMessage {
  type: 'ui';
  requestId: string;
  tree: UiTree;
}

export interface UiPushMessage {
  type: 'uiPush';
  extensionId: string;
  commandId: string;
  query: string;
  filterValue?: string;
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
  | ReadyMessage
  | UiMessage
  | UiPushMessage
  | ErrorMessage
  | AckMessage
  | NativeCallMessage
  | LogMessage;

export function defineExtension(module: ExtensionModule): ExtensionModule {
  return module;
}
