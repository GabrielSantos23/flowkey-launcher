import { profileService } from '../profile/profileService';
import { authService } from '../auth/authService';
import { gate } from '../auth/gateService';
import { settingsService } from '../settings/settingsService';
import { logService } from '../log/logService';
import { feedbackService } from '../feedback/feedbackService';
import * as commands from '../../lib/ipc/commands';
import type { ISyncProvider, SyncChangeEvent, Unsubscribe } from '../profile/types';

export const PERIODIC_SYNC_INTERVAL_MS = 60 * 1000;

class CloudSyncService {
  status: 'idle' | 'syncing' | 'error' = 'idle';
  lastSyncedAt: Date | null = null;
  lastError: string | null = null;
  lastReport: commands.SyncRunReport | null = null;

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private currentRun: Promise<void> | null = null;
  private providerUnsubs: Unsubscribe[] = [];
  private settingsUnsub: (() => void) | null = null;
  private lastEnabledSeen: boolean | null = null;
  private lastLoggedFailureSummary: string | null = null;

  get enabled(): boolean {
    return settingsService.getSettings().user?.syncEnabled ?? true;
  }

  private blockedReason(): string | null {
    const result = gate.gate('cloud-sync-egress');
    return result.allowed ? null : (result.reason ?? 'Cloud sync denied by policy');
  }

  async init(): Promise<void> {
    this.watchSettings();
    await this.start();
  }

  private async start(): Promise<void> {
    if (this.blockedReason() !== null) {
      this.stop();
      return;
    }

    await this.checkStatus().catch((err) => {
      logService.warn(`Cloud sync checkStatus failed: ${err}`);
    });

    this.syncNow().catch((err) => {
      logService.warn(`Cloud sync initial run failed: ${err}`);
    });

    this.startPeriodicSync();
    this.subscribeToProviders();
  }

  private watchSettings(): void {
    if (this.settingsUnsub !== null) return;
    this.settingsUnsub = settingsService.subscribe((settings) => {
      const enabled = settings.user?.syncEnabled ?? true;
      if (this.lastEnabledSeen === enabled) return;
      const isPriming = this.lastEnabledSeen === null;
      this.lastEnabledSeen = enabled;
      if (isPriming) return;
      if (enabled) {
        this.start().catch((err) => {
          logService.warn(`Cloud sync: start after enable failed: ${err}`);
        });
      } else {
        this.stop();
      }
    });
  }

  startPeriodicSync(): void {
    if (this.syncTimer !== null) return;
    this.syncTimer = setInterval(() => {
      this.syncNow().catch((err) => {
        logService.warn(`Periodic cloud sync failed: ${err}`);
      });
    }, PERIODIC_SYNC_INTERVAL_MS);
  }

  stopPeriodicSync(): void {
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private stop(): void {
    this.stopPeriodicSync();
    for (const unsub of this.providerUnsubs) {
      try {
        unsub();
      } catch (err) {
        logService.warn(`Cloud sync: provider unsubscribe threw: ${err}`);
      }
    }
    this.providerUnsubs = [];
  }

  dispose(): void {
    this.stop();
    if (this.settingsUnsub !== null) {
      try {
        this.settingsUnsub();
      } catch (err) {
        logService.warn(`Cloud sync: settings unsubscribe threw: ${err}`);
      }
      this.settingsUnsub = null;
    }
    this.lastEnabledSeen = null;
  }

  async syncNow(): Promise<void> {
    const blocked = this.blockedReason();
    if (blocked !== null) {
      throw new Error(blocked);
    }
    if (this.currentRun) {
      return this.currentRun;
    }
    this.currentRun = this.runOnce().finally(() => {
      this.currentRun = null;
    });
    return this.currentRun;
  }

  async checkStatus(): Promise<void> {
    if (this.blockedReason() !== null) return;
    const statusResp = await commands.syncGetStatus();
    if (statusResp?.lastFullSyncAtIso) {
      this.lastSyncedAt = new Date(statusResp.lastFullSyncAtIso);
    } else {
      this.lastSyncedAt = null;
    }
  }

  private async runOnce(): Promise<void> {
    try {
      this.status = 'syncing';
      const sources = await this.collectSources();
      const report = await commands.syncRun(sources);
      if (!report) {
        await feedbackService.report({
          source: 'frontend',
          kind: 'sync.run-failed',
          severity: 'warning',
          retryable: true,
          developerDetail: 'Cloud sync run did not complete. Will retry on next tick.',
        });
        this.status = 'error';
        return;
      }

      await this.applyPullRecords(report.appliedRecords);
      this.surfaceWarnings(report);

      this.lastReport = report;
      this.lastSyncedAt = new Date();
      this.lastError = null;
      this.status = 'idle';
    } catch (err: unknown) {
      this.status = 'error';
      const errMsg = err instanceof Error ? err.message : String(err);
      this.lastError = errMsg;

      if (
        errMsg.includes('Token expired') ||
        errMsg.includes('Not logged in') ||
        errMsg.includes('401')
      ) {
        logService.warn(`Cloud sync: auth token rejected/expired (${errMsg}); disposing sync`);
        this.dispose();
        authService.logout().catch(() => {});
        return;
      }

      logService.error(`Cloud sync run failed: ${err}`);
    }
  }

  private async collectSources(): Promise<commands.LocalItemSourceWire[]> {
    const allProviders = profileService.getProviders();
    const allowedProviders = allProviders.filter((p) => p.syncTier === 'core');

    const sources: commands.LocalItemSourceWire[] = [];
    for (const provider of allowedProviders) {
      const items = await provider.exportItems();
      const hasSensitiveFields = provider.sensitiveFields.length > 0;
      for (const item of items) {
        let contentJson: string;
        if (hasSensitiveFields && item.content !== null && typeof item.content === 'object') {
          const cloned = JSON.parse(JSON.stringify(item.content)) as unknown;
          provider.sensitiveFields.forEach((path) => stripField(cloned, path));
          contentJson = JSON.stringify(cloned);
        } else {
          contentJson = JSON.stringify(item.content);
        }
        sources.push({
          itemId: item.id,
          categoryId: item.categoryId,
          content: contentJson,
        });
      }
    }
    return sources;
  }

  private async applyPullRecords(records: commands.AppliedRecord[]): Promise<void> {
    if (records.length === 0) return;
    const byId = new Map<string, ISyncProvider>();
    for (const p of profileService.getProviders()) {
      byId.set(p.id, p);
    }
    for (const record of records) {
      const provider = byId.get(record.categoryId);
      if (!provider) {
        logService.warn(
          `Cloud sync: no provider registered for categoryId='${record.categoryId}', skipping ${record.itemId}`,
        );
        continue;
      }
      try {
        if (record.deleted) {
          await provider.applyItemDelete(record.itemId);
        } else {
          const content = record.content === null ? null : (JSON.parse(record.content) as unknown);
          await provider.applyItemUpsert({
            id: record.itemId,
            categoryId: record.categoryId,
            content,
          });
        }
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        logService.warn(
          `Cloud sync: provider '${record.categoryId}' failed to apply ${record.itemId}: ${detail}`,
        );
        await feedbackService.report({
          source: 'frontend',
          kind: 'sync.apply-failed',
          severity: 'warning',
          retryable: false,
          context: {
            categoryId: record.categoryId,
            itemId: record.itemId,
          },
          developerDetail: detail,
        });
      }
    }
  }

  private surfaceWarnings(report: commands.SyncRunReport): void {
    if (report.lwwWarnings.length > 0) {
      const count = report.lwwWarnings.length;
      feedbackService
        .report({
          source: 'frontend',
          kind: 'sync.item-overwritten',
          severity: 'warning',
          retryable: false,
          context: {
            count: String(count),
            itemIds: report.lwwWarnings.join(','),
          },
          developerDetail:
            count === 1
              ? '1 item was overwritten by a newer version from another device.'
              : `${count} items were overwritten by newer versions from another device.`,
        })
        .catch((err) => {
          logService.warn(`Cloud sync: failed to surface LWW diagnostic: ${err}`);
        });
    }
    if (report.failed.length > 0) {
      const summary = `${report.failed.length}:${report.failed
        .map((f) => f.itemId)
        .sort()
        .join(',')}`;
      const detail = report.failed.map((f) => `${f.itemId} (${f.reason})`).join(', ');

      if (this.lastLoggedFailureSummary !== summary) {
        this.lastLoggedFailureSummary = summary;
        logService.warn(`Cloud sync had ${report.failed.length} failed items: ${detail}`);
      } else {
        logService.debug(`Cloud sync repeated failure (${report.failed.length} items): ${detail}`);
      }

      feedbackService
        .report({
          source: 'frontend',
          kind: 'sync.apply-failed',
          severity: 'warning',
          retryable: true,
          context: {
            count: String(report.failed.length),
          },
          developerDetail: `${report.failed.length} item${report.failed.length === 1 ? '' : 's'} failed to upload: ${detail}`,
        })
        .catch((err) => {
          logService.warn(`Cloud sync: failed to surface push-failure diagnostic: ${err}`);
        });
    } else {
      this.lastLoggedFailureSummary = null;
    }
  }

  private subscribeToProviders(): void {
    for (const unsub of this.providerUnsubs) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.providerUnsubs = [];

    for (const provider of profileService.getProviders()) {
      try {
        const unsub = provider.subscribeToChanges((ev: SyncChangeEvent) => {
          (async () => {
            if (ev.type === 'delete') {
              try {
                await commands.syncMarkTombstone(ev.itemId, ev.categoryId);
              } catch (err) {
                logService.warn(`Cloud sync: failed to mark tombstone for ${ev.itemId}: ${err}`);
              }
            }
            await this.syncNow();
          })().catch((err) => {
            logService.warn(`Cloud sync: change-triggered run failed for ${provider.id}: ${err}`);
          });
        });
        this.providerUnsubs.push(unsub);
      } catch (err: unknown) {
        logService.warn(`Cloud sync: provider ${provider.id} subscribeToChanges threw: ${err}`);
      }
    }
  }
}

function stripField(obj: unknown, dotPath: string): void {
  if (typeof obj !== 'object' || obj === null) return;
  const parts = dotPath.split('.');
  let current: Record<string, unknown> = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
    if (typeof current !== 'object' || current === null) return;
  }
  delete current[parts[parts.length - 1]];
}

export const cloudSyncService = new CloudSyncService();
