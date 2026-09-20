import { defineServiceRegistry, type ServiceRegistry } from './defineServiceRegistry';
import { rankItemsCommand } from '../../lib/ipc/searchAccessoryCommands';
import type {
  ConfirmAlertOptions,
  BackgroundFeedbackOptions,
  FeedbackAnnouncement,
  FeedbackProgressOptions,
  FeedbackReport,
  IExtensionManager,
  RankableItem,
} from 'asyar-sdk/contracts';
import type { ExtendedManifest } from '../../types/ExtendedManifest';
import { logService } from '../log/logService';
import { settingsService } from '../settings/settingsService';
import { clipboardHistoryService } from '../clipboard/clipboardHistoryService';
import { commandService } from './commandService';
import { actionService } from '../action/actionService';
import { statusBarService } from '../statusBar/statusBarService';
import { searchBarAccessoryService } from '../search/searchBarAccessoryService';
import type { SearchBarAccessoryDropdownOption } from 'asyar-sdk/contracts';
import { gate } from '../auth/gateService';
import { authService } from '../auth/authService';
import { extensionStorageService } from '../storage/extensionStorageService';
import { notesService } from './notesService';
import { extensionPreferencesService } from './extensionPreferencesService';
import { extensionCacheService } from '../storage/extensionCacheService';
import { feedbackService } from '../feedback/feedbackService';
import { islandService } from '../island/islandService';
import type { IslandShowOptions } from 'asyar-sdk/contracts';
import { selectionService } from '../selection/selectionService';
import { extensionOAuthService } from '../oauth/extensionOAuthService';
import { shellService } from '../shell/shellService';
import { fileManagerService } from '../fileManager/fileManagerService';
import { InteropService } from '../interop/interopService';
import { applicationService } from '../application/applicationService';
import { windowManagementService } from '../windowManagement/windowManagementService';
import { openerService } from '../opener/openerService';
import { networkService } from '../network/networkService';
import { powerService } from '../power/powerService';
import { screenService } from '../screen/screenService';
import { processService } from '../process/processService';
import { systemEventsService } from '../systemEvents/systemEventsService';
import { appEventsService } from '../appEvents/appEventsService';
import { applicationIndexService } from '../applicationIndex/applicationIndexService';
import { timerService } from '../timers/timerService';
import { fsWatcherService } from '../fsWatcher/fsWatcherService';
import { browserService } from '../browser/browserService';
import { filesService } from '../files/filesService';
import { extensionStateService } from '../extensionState/extensionStateService';
import { runService } from '../run/runService';
import { getSystemLocale } from '../../lib/ipc/commands';
import { completeExtensionOnboarding } from '../../lib/ipc/extensionLifecycleCommands';

export function buildServiceRegistry(deps: {
  extensionManager: IExtensionManager;
  getManifestById: (id: string) => ExtendedManifest | undefined;
  handleCommandAction: (objectId: string, args?: Record<string, unknown>) => Promise<unknown>;
}): ServiceRegistry {
  return defineServiceRegistry({
    log: logService,
    extensions: deps.extensionManager,
    clipboard: clipboardHistoryService,
    commands: commandService,
    actions: actionService,
    settings: {
      get: async (section: string, key: string) => {
        const settings = settingsService.getSettings();
        return (settings as any)[section]?.[key];
      },
      set: async (section: string, key: string, value: any) => {
        return settingsService.updateSettings(section as any, { [key]: value });
      },
    },
    statusBar: statusBarService,
    searchBar: {
      // The IPC dispatcher spreads payload values via `Object.values`. The
      // SDK proxy wraps `set` in a single-keyed envelope (`{ opts }`) so
      // the spread yields `[opts]` rather than `[options, value]` in
      // unstable key order — see ExtensionIpcRouter.dispatchApiCall.
      set: (
        extensionId: string,
        opts: { options?: SearchBarAccessoryDropdownOption[]; value?: string },
      ) => searchBarAccessoryService.set(extensionId, opts ?? {}),
      clear: (extensionId: string) => searchBarAccessoryService.clearForExtension(extensionId),
    },
    entitlements: {
      check: (entitlement: string) => gate.allows(entitlement as any),
      getAll: () => authService.entitlements,
    },
    storage: extensionStorageService,
    notes: notesService,
    preferences: {
      getAll: (extensionId: string) =>
        extensionPreferencesService.getEffectivePreferences(extensionId),
      set: (extensionId: string, scope: string, key: string, value: unknown) =>
        extensionPreferencesService.set(
          extensionId,
          scope === 'extension' ? null : scope,
          key,
          value,
        ),
      reset: (extensionId: string, scope: string) =>
        extensionPreferencesService.reset(extensionId, scope),
    },
    cache: extensionCacheService,
    // Same Rust ranker the launcher's own search uses (search_engine::ranker).
    // Stateless passthrough — no permission required (see permissions.rs).
    search: {
      rank: async (query: string, items: RankableItem[]) =>
        (await rankItemsCommand(query, items)) ?? [],
    },
    feedback: {
      report: (extensionId: string, feedback: FeedbackReport) =>
        feedbackService.report({ ...feedback, source: 'extension', extensionId }),
      showProgress: (extensionId: string, options: FeedbackProgressOptions) =>
        feedbackService.startProgressForExtension(extensionId, options),
      updateProgress: (_extensionId: string, feedbackId: string, update: FeedbackProgressOptions) =>
        feedbackService.updateProgressForExtension(_extensionId, feedbackId, update),
      finishProgress: (
        _extensionId: string,
        feedbackId: string,
        outcome: { severity: 'success' | 'error'; title: string; developerDetail?: string },
      ) => feedbackService.finishProgressForExtension(_extensionId, feedbackId, outcome),
      dismiss: (_extensionId: string, feedbackId: string) =>
        feedbackService.dismissForExtension(_extensionId, feedbackId),
      announce: (extensionId: string, announcement: FeedbackAnnouncement) =>
        feedbackService.announceForExtension(extensionId, announcement),
      sendBackground: (extensionId: string, options: BackgroundFeedbackOptions) =>
        feedbackService.sendBackgroundForSource(extensionId, options),
      dismissBackground: (extensionId: string, feedbackId: string) =>
        feedbackService.dismissBackgroundForSource(extensionId, feedbackId),
      confirmAlert: (_extensionId: string, options: ConfirmAlertOptions) =>
        feedbackService.confirmAlert(options),
    },
    // Dynamic Island — transient notification pill at the top of the screen.
    // Host-only semantics (`dismissLauncher`) are stripped here so extensions
    // can never hide the launcher window through this namespace.
    island: {
      show: (_extensionId: string, options: IslandShowOptions) =>
        islandService.show({ ...options, dismissLauncher: false }),
      dismiss: () => islandService.hide(),
    },
    selection: selectionService,
    oauth: extensionOAuthService,
    shell: {
      spawn: (
        extensionId: string,
        program: string,
        args: string[] = [],
        spawnId: string,
        stdin?: string,
        originRole?: 'view' | 'worker',
      ) =>
        shellService.spawn(
          extensionId,
          program,
          args,
          spawnId,
          originRole,
          undefined,
          undefined,
          stdin,
        ),
      list: (extensionId: string) => shellService.list(extensionId),
      attach: (extensionId: string, spawnId: string, originRole?: 'view' | 'worker') =>
        shellService.attach(extensionId, spawnId, originRole),
      writeStdin: (extensionId: string, spawnId: string, data: string) =>
        shellService.writeStdin(spawnId, data, extensionId),
      closeStdin: (extensionId: string, spawnId: string) =>
        shellService.closeStdin(spawnId, extensionId),
      'write-stdin': (extensionId: string, spawnId: string, data: string) =>
        shellService.writeStdin(spawnId, data, extensionId),
      'close-stdin': (extensionId: string, spawnId: string) =>
        shellService.closeStdin(spawnId, extensionId),
    },
    fs: fileManagerService,
    interop: new InteropService({
      hasCommand: (objectId: string) => commandService.commands.has(objectId),
      getManifestById: (id: string) => deps.getManifestById(id),
      handleCommandAction: (objectId: string, args?: Record<string, unknown>) =>
        deps.handleCommandAction(objectId, args),
    }),
    application: applicationService,
    window: windowManagementService,
    opener: openerService,
    network: networkService,
    power: powerService,
    screen: screenService,
    process: processService,
    systemEvents: systemEventsService,
    appEvents: appEventsService,
    applicationIndex: applicationIndexService,
    timers: timerService,
    fsWatcher: fsWatcherService,
    browser: browserService,
    files: filesService,
    state: extensionStateService,
    runs: runService,
    onboarding: {
      complete: async (extensionId: string) => {
        await completeExtensionOnboarding(extensionId);
      },
    },
    environment: {
      getEnvironment: async (extensionId: string) => {
        const parsed = await getSystemLocale();
        const platform = 'windows';
        const locale =
          parsed?.raw ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
        const language = parsed?.language ?? locale.split(/[-_]/)[0] ?? 'en';
        const region = parsed?.region ?? null;
        const script = parsed?.script ?? null;
        const theme =
          typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light';
        const isDevelopment = import.meta.env?.DEV ?? false;

        return {
          locale,
          language,
          region,
          script,
          numberFormat: 'point',
          platform,
          theme,
          isDevelopment,
          extensionId: extensionId ?? '',
        };
      },
    },
  });
}
