import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ConfirmAlertOptions,
  FeedbackAnnouncement,
  FeedbackProgressHandle,
  FeedbackProgressOptions,
  FeedbackReport,
  IFeedbackService,
} from 'asyar-sdk/contracts';
import * as feedbackCommands from './internal/feedbackCommands';
import type { NotificationOptions } from 'asyar-sdk/contracts';
import { notificationService } from '../notification/notificationService';
import { openerService } from '../opener/openerService';

interface ActiveAnnouncement {
  id: string;
  title: string;
  message?: string;
  extensionId: string;
  onClick?: () => void | Promise<void>;
  onDismiss?: () => void | Promise<void>;
}

export interface HostAnnouncementOptions extends FeedbackAnnouncement {
  title: string;
  message?: string;
  onClick?: () => void;
  onDismiss?: () => void;
}

export type HostFeedbackReport = FeedbackReport & {
  source?: 'rust' | 'frontend' | 'extension';
  extensionId?: string;
};

interface ActiveDialog {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
}

class FeedbackService implements IFeedbackService {
  current: feedbackCommands.FeedbackItem | null = null;
  activeAnnouncement: ActiveAnnouncement | null = null;
  activeDialog: ActiveDialog | null = null;

  private dialogResolver: ((result: boolean) => void) | null = null;
  private retryRegistry = new Map<string, () => Promise<void>>();
  private reportRegistry = new Map<string, () => Promise<void>>();
  private actionSequence = 0;
  private unlisten: UnlistenFn | null = null;

  async initialize(): Promise<void> {
    if (this.unlisten) return;
    try {
      this.current = await feedbackCommands.getCurrent();
      this.unlisten = await listen<feedbackCommands.FeedbackItem | null>(
        'feedback:changed',
        ({ payload }) => {
          this.current = payload;
        },
      );
    } catch {
      // Feedback must never break the operation it describes.
    }
  }

  reset(): void {
    this.current = null;
    this.activeAnnouncement = null;
    this.activeDialog = null;
    this.dialogResolver = null;
    this.retryRegistry.clear();
    this.reportRegistry.clear();
    this.actionSequence = 0;
  }

  async report(feedback: HostFeedbackReport): Promise<void> {
    try {
      await feedbackCommands.publish({
        source: feedback.source ?? 'frontend',
        kind: feedback.kind,
        severity: feedback.severity,
        retryable: feedback.retryable,
        context: feedback.context ?? {},
        developerDetail: feedback.developerDetail,
        extensionId: feedback.extensionId,
        retryActionId: feedback.retryActionId,
        reportActionId: feedback.reportActionId,
      });
    } catch {
      // Feedback must never break the operation it describes.
    }
  }

  async showProgress(options: FeedbackProgressOptions): Promise<FeedbackProgressHandle> {
    const feedbackId = await this.startProgressForSource('frontend', undefined, options);
    return this.createProgressHandle(feedbackId);
  }

  startProgressForExtension(
    extensionId: string,
    options: FeedbackProgressOptions,
  ): Promise<string> {
    return this.startProgressForSource('extension', extensionId, options);
  }

  private startProgressForSource(
    source: 'frontend' | 'extension',
    extensionId: string | undefined,
    options: FeedbackProgressOptions,
  ): Promise<string> {
    return feedbackCommands.publish({
      source,
      kind: 'progress',
      severity: 'progress',
      retryable: false,
      context: {},
      extensionId,
      progress: options,
    });
  }

  private createProgressHandle(feedbackId: string): FeedbackProgressHandle {
    return {
      update: (update) => feedbackCommands.updateProgress(feedbackId, update),
      succeed: (title) => feedbackCommands.finishProgress(feedbackId, 'success', title),
      fail: (title, developerDetail) =>
        feedbackCommands.finishProgress(feedbackId, 'error', title, developerDetail),
      dismiss: () => this.dismissOwned(feedbackId),
    };
  }

  async announceForExtension(
    extensionId: string,
    announcement: FeedbackAnnouncement,
  ): Promise<void> {
    if (this.activeAnnouncement) return;
    if (!(await feedbackCommands.acceptAnnouncement(extensionId, announcement.id))) return;
    const { action, ...content } = announcement;
    this.activeAnnouncement = {
      ...content,
      extensionId,
      onClick:
        action?.type === 'open-url' ? () => openerService.open(extensionId, action.url) : undefined,
    };
  }

  announce(announcement: FeedbackAnnouncement): Promise<void> {
    return this.announceForExtension('asyar', announcement);
  }

  async announceFromHost(options: HostAnnouncementOptions): Promise<void> {
    if (this.activeAnnouncement) return;
    if (!(await feedbackCommands.acceptAnnouncement('asyar', options.id))) return;
    this.activeAnnouncement = { ...options, extensionId: 'asyar' };
  }

  sendBackground(options: NotificationOptions): Promise<string> {
    return this.sendBackgroundForSource('asyar', options);
  }

  sendBackgroundForSource(sourceId: string, options: NotificationOptions): Promise<string> {
    return notificationService.send(sourceId, options);
  }

  dismissBackground(feedbackId: string): Promise<void> {
    return this.dismissBackgroundForSource('asyar', feedbackId);
  }

  dismissBackgroundForSource(sourceId: string, feedbackId: string): Promise<void> {
    return notificationService.dismiss(sourceId, feedbackId);
  }

  checkBackgroundPermission(): Promise<boolean> {
    return notificationService.checkPermission();
  }

  requestBackgroundPermission(): Promise<boolean> {
    return notificationService.requestPermission();
  }

  updateProgressForExtension(
    extensionId: string,
    feedbackId: string,
    update: FeedbackProgressOptions,
  ): Promise<void> {
    return feedbackCommands.updateProgress(feedbackId, update, extensionId);
  }

  finishProgressForExtension(
    extensionId: string,
    feedbackId: string,
    outcome: { severity: 'success' | 'error'; title: string; developerDetail?: string },
  ): Promise<void> {
    return feedbackCommands.finishProgress(
      feedbackId,
      outcome.severity,
      outcome.title,
      outcome.developerDetail,
      extensionId,
    );
  }

  dismissForExtension(extensionId: string, feedbackId: string): Promise<void> {
    return this.dismissOwned(feedbackId, extensionId);
  }

  async onAnnouncementClicked(): Promise<void> {
    const announcement = this.activeAnnouncement;
    if (!announcement?.onClick) return;
    this.activeAnnouncement = null;
    await announcement.onClick();
  }

  onAnnouncementDismissed(): void {
    const announcement = this.activeAnnouncement;
    this.activeAnnouncement = null;
    announcement?.onDismiss?.();
  }

  dismiss(feedbackId = this.current?.id): Promise<void> {
    return feedbackId ? this.dismissOwned(feedbackId) : Promise.resolve();
  }

  private async dismissOwned(feedbackId: string, expectedExtensionId?: string): Promise<void> {
    const next = expectedExtensionId
      ? await feedbackCommands.dismiss(feedbackId, expectedExtensionId)
      : await feedbackCommands.dismiss(feedbackId);
    if (this.current?.id === feedbackId) {
      this.current = next;
    }
  }

  registerRetry(fn: () => Promise<void>): string {
    const id = `retry-${++this.actionSequence}`;
    this.retryRegistry.set(id, fn);
    return id;
  }

  async triggerRetry(id: string): Promise<void> {
    const retry = this.retryRegistry.get(id);
    if (!retry) return;
    this.retryRegistry.delete(id);
    await retry();
  }

  registerReport(fn: () => Promise<void>): string {
    const id = `report-${++this.actionSequence}`;
    this.reportRegistry.set(id, fn);
    return id;
  }

  async triggerReport(id: string): Promise<void> {
    await this.reportRegistry.get(id)?.();
  }

  async confirmAlert(options: ConfirmAlertOptions): Promise<boolean> {
    // If a dialog is already open, treat the second call as cancelled.
    // This matches Raycast's behavior and avoids forcing every caller to
    // wrap confirmAlert in try/catch just to handle a race condition.
    // The first dialog continues unaffected.
    if (this.activeDialog !== null) {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      this.dialogResolver = resolve;
      this.activeDialog = {
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        variant: options.variant,
      };
    });
  }

  /** Called by `<DialogHost />` when the user clicks Confirm. */
  onDialogConfirmed(): void {
    const resolver = this.dialogResolver;
    this.dialogResolver = null;
    this.activeDialog = null;
    resolver?.(true);
  }

  /** Called by `<DialogHost />` when the user clicks Cancel, presses Escape, or clicks the backdrop. */
  onDialogCancelled(): void {
    const resolver = this.dialogResolver;
    this.dialogResolver = null;
    this.activeDialog = null;
    resolver?.(false);
  }
}

export const feedbackService = new FeedbackService();
