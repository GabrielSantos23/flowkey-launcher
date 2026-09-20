import { logService } from './log/logService';
import { authService } from './auth/authService';
import { cloudSyncService } from './sync/cloudSyncService';

import { performanceService } from './performance/performanceService';
import { runtimeService } from './runtime/runtimeService';
import { clipboardHistoryService } from './clipboard/clipboardHistoryService';
import { clipboardPrivacyService } from './privacy/clipboardPrivacyService';
import { secretRedactionService } from './privacy/secretRedactionService';
import { encryptionService } from './privacy/encryptionService';
import { applicationService } from './application/applicationsService';
import extensionManager from './extension/extensionManager';
import { commandService } from './extension/commandService'; // Import commandService instance
import { installOnboardingCompletionListener } from './extension/onboardingViewInterception';
import { viewManager } from './extension/viewManager';
import { resetLauncherState } from '../lib/launcher/launcherReset';
import { settingsService } from './settings/settingsService';
import { type Event, listen } from '@tauri-apps/api/event';
import * as commands from '../lib/ipc/commands';
import { runWhenIdle } from '../lib/idle';
import { shortcutService } from '../built-in-features/shortcuts/shortcutService';
import { shortcutStore } from '../built-in-features/shortcuts/shortcutStore';
import { snippetStore } from '../built-in-features/snippets/snippetStore';
import { snippetService } from '../built-in-features/snippets/snippetService';
import { portalStore } from '../built-in-features/portals/portalStore';
import { profileService } from './profile/profileService';
import { extensionOAuthService } from './oauth/extensionOAuthService';
import { SnippetsSyncProvider } from './profile/providers/snippetsSyncProvider';
import { NotesSyncProvider } from './profile/providers/notesSyncProvider';
import { ShortcutsSyncProvider } from './profile/providers/shortcutsSyncProvider';
import { PortalsSyncProvider } from './profile/providers/portalsSyncProvider';
import { SettingsSyncProvider } from './profile/providers/settingsSyncProvider';
import { ClipboardSyncProvider } from './profile/providers/clipboardSyncProvider';
import { ExtensionsSyncProvider } from './profile/providers/extensionsSyncProvider';
import { ExtensionPreferencesSyncProvider } from './profile/providers/extensionPreferencesSyncProvider';
import { systemEventsBridge } from './systemEvents/systemEventsBridge';
import { appEventsBridge } from './appEvents/appEventsBridge';
import { indexEventsBridge } from './applicationIndex/indexEventsBridge';
import { browserEventsBridge } from './browser/browserEventsBridge';
import { fsWatcherBridge } from './fsWatcher/fsWatcherBridge';
import { networkWsPushBridge } from './network/networkWsPushBridge';
import { stateChangedBridge } from './extensionState/stateChangedBridge';
import { rpcReplyBridge } from './extensionState/rpcReplyBridge';
import { initScanPathsSync } from './application/scanPathsSync';
import { initFileIndexConfigSync } from './fileIndex/fileIndexConfigSync';
import { trayClickBridge } from './statusBar/trayClickBridge';
import { viewRegistry } from './extension/viewRegistry';
import { workerRegistry } from './extension/workerRegistry';
import { extensionReadinessListener } from './extension/extensionReadinessListener';
import { iframeDeliveryListener } from './extension/iframeDeliveryListener';
import { restoreWorkers } from '../lib/ipc/iframeLifecycleCommands';
import { feedbackService } from './feedback/feedbackService';
import { favoritesService } from './favorites/favoritesService';
import { setInvokeFailureReporter } from '../lib/ipc/invokeSafe';
import { startBridgeLoop } from '../lib/ipc/bridgeEvents';

// Flag to prevent multiple initializations
let isInitialized = false;

/**
 * Registers all core profile sync providers.
 * Idempotent — safe to call from any window context (main launcher or settings window).
 */
export function registerProfileProviders(): void {
  if (profileService.getProviders().length > 0) return;
  profileService.registerProvider(new SettingsSyncProvider());
  profileService.registerProvider(new SnippetsSyncProvider());
  profileService.registerProvider(new NotesSyncProvider());
  profileService.registerProvider(new ShortcutsSyncProvider());
  profileService.registerProvider(new PortalsSyncProvider());
  profileService.registerProvider(new ClipboardSyncProvider());
  profileService.registerProvider(new ExtensionsSyncProvider());
  profileService.registerProvider(new ExtensionPreferencesSyncProvider());
}

export const appInitializer = {
  isAppInitialized(): boolean {
    return isInitialized;
  },

  async init(): Promise<boolean> {
    if (isInitialized) {
      logService.warn('Application already initialized.');
      return true;
    }
    isInitialized = true; // Set early to prevent concurrent calls

    try {
      // Start the eval-free event bridge loop first so early Rust events
      // get buffered rather than lost before listeners register.
      startBridgeLoop();

      logService.info(`Application starting initialization...`);

      // Route invoke failures to the diagnostics UI. Wired here (composition
      // root) so the IPC transport doesn't import the feedback store.
      setInvokeFailureReporter(feedbackService);

      // Initialize auth (load cached token + background entitlement refresh)
      await authService.init();
      logService.info('Auth service initialized.');

      await extensionOAuthService.init();
      logService.info('Extension OAuth service initialized.');

      // Register profile sync providers before cloud sync so the initial upload has all providers
      registerProfileProviders();
      logService.info('Profile sync providers registered.');

      // Initialize cloud sync — background, do not block startup
      cloudSyncService.init().catch((err: any) => {
        logService.warn(`Cloud sync init failed: ${err}`);
      });
      logService.info('Cloud sync service initialized.');

      // Seed the favorites cache so the first empty-query render already
      // carries the Favorites section.
      await favoritesService.load().catch((err: unknown) => {
        logService.warn(`Favorites service init failed: ${err}`);
      });

      // Initialize performance service first
      await performanceService.init();

      logService.custom('🔍 Performance monitoring initialized', 'PERF', 'cyan', 'cyan');
      performanceService.logPerformanceReport(); // Initial report

      // Initialize core services
      // Seed the clipboard privacy filter (denylist + session stats) before
      // clipboard monitoring starts, so the very first capture event is
      // already gated against the persisted user denylist.
      await clipboardPrivacyService.init().catch((err: unknown) => {
        logService.warn(`Clipboard privacy init failed: ${err}`);
      });

      // Seed the secret-redaction filter (per-category toggles + catalog)
      // before any clipboard / snippet append fires.
      await secretRedactionService.init().catch((err: unknown) => {
        logService.warn(`Secret redaction init failed: ${err}`);
      });

      // Seed the encryption-status reactive store so the privacy UI
      // can show 'active' / 'fallback' / 'unknown' the moment the
      // user opens settings.
      await encryptionService.init().catch((err: unknown) => {
        logService.warn(`Encryption service init failed: ${err}`);
      });

      // Register extension view interceptor for onboarding flow
      installOnboardingCompletionListener((viewPath) => {
        void extensionManager.navigateToView(viewPath);
      });

      // Ensure runtimes catalog is initialized
      try {
        await runtimeService.init();
        logService.info('Runtime service initialized successfully.');
      } catch (runtimeError) {
        logService.error(`Failed to initialize runtime service: ${runtimeError}`);
      }

      await shortcutService.init();
      logService.info('Shortcut service initialized.');

      await snippetService.init();
      logService.info('Snippet service initialized.');

      await portalStore.init();
      logService.info('Portals service initialized.');

      // Initialize extension manager - this must happen before we try to use any extensions
      // This will load both built-in and external extensions
      const extensionInitSuccess = await extensionManager.init();
      if (!extensionInitSuccess) {
        logService.error('Failed to initialize ExtensionManager.');
        return false;
      }
      logService.info('ExtensionManager initialized successfully.');

      // Initialize application service
      await applicationService.init();
      logService.info('Application service initialized.');

      // Reset search state when the launcher window hides
      await listen('tauri://blur', () => {
        resetLauncherState();
      });

      // Initialize clipboard history service
      await clipboardHistoryService.initialize();
      logService.info('Clipboard history service initialized.');

      // Wire up the live push bridges for worker-capable subsystems.
      // Every bridge wires its Tauri event listener -> registry fanout.
      // Initialized AFTER workerRegistry / viewRegistry exist so listeners
      // are ready before any worker iframe starts.

      // The worker registry's bridge listeners MUST be attached before
      // `restoreWorkers()` fires below: without them, `asyar:iframe:mount`
      // events are dropped and no worker iframe ever spawns.
      await workerRegistry.init();
      systemEventsBridge.init();
      appEventsBridge.init();
      indexEventsBridge.init();
      browserEventsBridge.init();
      fsWatcherBridge.init();
      networkWsPushBridge.init();
      stateChangedBridge.init();
      rpcReplyBridge.init();
      trayClickBridge.init();
      extensionReadinessListener.init();
      iframeDeliveryListener.init();
      logService.info('Subsystem push bridges wired.');

      // Wire background push listeners for application scan paths and
      // file index configuration changes so the Rust watcher reacts
      // immediately when settings change without a full restart.
      initScanPathsSync();
      initFileIndexConfigSync();
      logService.info('Scan paths and file index config sync wired.');

      // Re-hydrate running background workers that survived the webview reload
      restoreWorkers()
        .then((activeIds) => {
          if (activeIds && activeIds.length > 0) {
            logService.info(
              `Restored ${activeIds.length} surviving background worker(s): ${activeIds.join(', ')}`,
            );
          }
        })
        .catch((err: any) => {
          logService.warn(`restoreWorkers failed (first launch?): ${err}`);
        });

      // Idle work: warm search index / background caches 1.5s after boot
      runWhenIdle(
        () => {
          logService.info('Running idle background warmup...');
          applicationService.resync().catch((err: any) => {
            logService.warn(`Idle application refresh failed: ${err}`);
          });
        },
        { timeout: 1500 },
      );

      logService.info('Application initialization complete.');
      return true;
    } catch (error) {
      logService.error(`Failed to initialize application: ${error}`);
      return false;
    }
  },
};
