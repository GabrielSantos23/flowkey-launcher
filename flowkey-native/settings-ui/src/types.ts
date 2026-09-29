/**
 * Mirror of the shell's SettingsState records (Native/SettingsState.cs),
 * serialized camelCase via Protocol.JsonOptions.Default. Keep in sync with
 * the C# records — the shell is the source of truth.
 */

export interface SettingsIconState {
  kind: string;
  emoji?: string | null;
  dataUri?: string | null;
}

export interface SettingsNavItem {
  key: string;
  label: string;
  icon: SettingsIconState | null;
}

export interface SettingsGeneralState {
  openAtLogin: boolean;
  summonHotkey: string;
  autoUpdateCheck: boolean;
}

export interface SettingsUpdateStatus {
  phase: string;
  message: string;
  newVersion?: string | null;
  progressPercent?: number | null;
}

export interface SettingsFailureRow {
  id: string;
  message: string;
}

export interface SettingsInstalledRow {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

export interface SettingsExtensionsState {
  loadFailures: SettingsFailureRow[];
  installed: SettingsInstalledRow[];
}

export interface SettingsAboutState {
  version: string;
  extensionsLoaded: number;
}

export interface SettingsOAuthRow {
  provider: string;
  status: string;
  error?: string | null;
}

export interface SettingsPreferenceOption {
  value: string;
  title: string;
}

export interface SettingsPreferenceField {
  name: string;
  type: string;
  title: string;
  label?: string | null;
  placeholder?: string | null;
  required: boolean;
  value: boolean | string | null;
  options: SettingsPreferenceOption[];
}

export interface SettingsAppOption {
  label: string;
  value: string;
}

export interface SettingsCommandRow {
  commandKey: string;
  commandId: string;
  title: string;
  shortcut: string | null;
  enabled: boolean;
}

export interface SettingsExtensionDetail {
  id: string;
  name: string;
  description?: string | null;
  version: string;
  icon: SettingsIconState | null;
  isZipInstalled: boolean;
  zipEnabled: boolean;
  installedAt?: string | null;
  oauth: SettingsOAuthRow[];
  preferences: SettingsPreferenceField[];
  appChoices: SettingsAppOption[];
  commands: SettingsCommandRow[];
}

export interface SettingsPendingConsent {
  kind: string;
  extensionId: string;
  name: string;
  version: string;
  description?: string | null;
  nativeMethods: string[];
  httpHosts: string[];
  oauth: string[];
  fsPaths: string[];
  uriSchemes: string[];
  hasWebUi: boolean;
  manifestWarnings: string[];
}

export interface SettingsCaptureState {
  scope: string;
  commandKey?: string | null;
}

export interface SettingsState {
  nav: SettingsNavItem[];
  general: SettingsGeneralState;
  extensions: SettingsExtensionsState;
  about: SettingsAboutState;
  update: SettingsUpdateStatus;
  details: Record<string, SettingsExtensionDetail>;
  pendingInstall: SettingsPendingConsent | null;
  pendingReconsent: SettingsPendingConsent | null;
  capture: SettingsCaptureState | null;
}

export type PreferenceValue = boolean | string;

/** Draft form values for one extension's preference form (field name → value). */
export type PreferenceDraft = Record<string, PreferenceValue>;
