import React, { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import PreferencesPromptHost from '../components/settings/PreferencesPromptHost';
import WorkerIframes from '../components/extension/WorkerIframes';
import { extractErrorMessage } from '../lib/errors';
import { installIdleCallbackPolyfill } from '../lib/idle';
import { feedbackService, type HostFeedbackReport } from '../services/feedback/feedbackService';
import { logService } from '../services/log/logService';
import { settingsService } from '../services/settings/settingsService';
import { applyThemePreference } from '../services/theme/themeMode';

// React port of AppShell boot responsibilities: idle-callback
// polyfill, platform attribute, theme application, global error reporting,
// and the Rust feedback channel. The wrapped children render inside it.
export default function AppChrome({
  page,
  children,
}: {
  page?: React.ReactNode;
  children?: React.ReactNode;
}) {
  installIdleCallbackPolyfill();

  useEffect(() => {
    let cancelled = false;
    if (!('__TAURI_INTERNALS__' in window)) return;
    void (async () => {
      try {
        const p = await platform();
        if (!cancelled) document.documentElement.dataset.platform = p;
      } catch (e) {
        logService.error(`Failed to get platform: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsService.initialized) return;
    applyThemePreference(settingsService.currentSettings.appearance.theme);
  });

  useEffect(() => {
    void feedbackService.initialize();
    const errorHandler = (e: ErrorEvent) => {
      const detail = e.error?.stack ?? extractErrorMessage(e.message);
      feedbackService.report({
        source: 'frontend',
        kind: 'uncaught_exception',
        severity: 'error',
        retryable: false,
        developerDetail: detail,
        context: { message: extractErrorMessage(e.message ?? e.error) },
      });
    };
    const rejectHandler = (e: PromiseRejectionEvent) => {
      const detail = extractErrorMessage(e.reason);
      feedbackService.report({
        source: 'frontend',
        kind: 'unhandled_rejection',
        severity: 'error',
        retryable: false,
        developerDetail: detail,
        context: { message: detail },
      });
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectHandler);
    const unlistenPromise = listen<HostFeedbackReport>('feedback:report', (event) => {
      feedbackService.report(event.payload);
    });
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectHandler);
      void unlistenPromise.then((fn) => fn());
    };
  }, []);

  return (
    <>
      {page ?? children}
      {/* Always-on Tier 2 worker iframes (background.main). Rendered once in
          the host window: WorkerIframes subscribes to mount events itself. */}
      <WorkerIframes />
      <PreferencesPromptHost />
    </>
  );
}
