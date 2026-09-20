import { getVersion } from '@tauri-apps/api/app';
import { emit } from '@tauri-apps/api/event';
import { profileService } from '../../../services/profile/profileService';
import { registerProfileProviders } from '../../../services/appInitializer';
import type {
  ISyncProvider,
  DataSummary,
  ImportPreview,
  ConflictStrategy,
  ArchiveManifest,
  SyncProviderData,
} from '../../../services/profile/types';
import type {
  ProfileArchiveContents,
  ProfileCategoryEntry,
  ProfileAssetEntry,
} from '../../../lib/ipc/commands';
import { logService } from '../../../services/log/logService';
import {
  showSaveProfileDialog,
  showOpenProfileDialog,
  exportProfile,
  importProfile,
} from '../../../lib/ipc/commands';

export class BackupHandler {
  // Shared
  providers: ISyncProvider[] = [];

  // Export state
  enabledCategories: Set<string> = new Set();
  localSummaries: Map<string, DataSummary> = new Map();
  exportPassword = '';
  exportStatus: 'idle' | 'exporting' | 'success' | 'error' = 'idle';
  exportMessage = '';

  // Import state
  importModalOpen = false;
  importFile = '';
  importManifest: ArchiveManifest | null = null;
  importPreviewData: Map<string, ImportPreview> = new Map();
  importCategories: Map<string, { enabled: boolean; strategy: ConflictStrategy }> = new Map();
  importNeedsPassword = false;
  importPassword = '';
  importStatus: 'idle' | 'importing' | 'success' | 'error' = 'idle';
  importMessage = '';

  // Internal — not reactive, only needed at apply-import time
  private _importContents: ProfileArchiveContents | null = null;

  get hasSensitiveData(): boolean {
    return this.providers
      .filter((p) => this.enabledCategories.has(p.id))
      .some((p) => p.sensitiveFields && p.sensitiveFields.length > 0);
  }

  get exportWarning(): string | null {
    if (this.hasSensitiveData && !this.exportPassword) {
      return 'Sensitive data (e.g. extension secrets) is included. Consider setting a password to encrypt your backup.';
    }
    return null;
  }

  get exportCategories(): { id: string; label: string; count: number }[] {
    return this.providers.map((p) => {
      const summary = this.localSummaries.get(p.id);
      return {
        id: p.id,
        label: p.displayName,
        count: summary?.itemCount ?? 0,
      };
    });
  }

  async init(): Promise<void> {
    registerProfileProviders();
    this.providers = profileService.getProviders();
    // Only providers opting into backup-by-default start enabled.
    this.enabledCategories = new Set(
      this.providers.filter((p) => p.defaultEnabled).map((p) => p.id),
    );

    for (const p of this.providers) {
      try {
        const summary = await p.getLocalSummary();
        this.localSummaries.set(p.id, summary);
      } catch (err) {
        logService.warn(`Failed to summarize ${p.id}: ${err}`);
      }
    }
  }

  toggleCategory(id: string): void {
    const next = new Set(this.enabledCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.enabledCategories = next;
  }

  async handleExport(): Promise<void> {
    if (this.exportStatus === 'exporting' || this.enabledCategories.size === 0) return;

    this.exportStatus = 'exporting';
    this.exportMessage = '';

    try {
      const defaultName = 'flowkey-backup.flowkey';
      const filePath = await showSaveProfileDialog(defaultName);
      if (!filePath) {
        this.exportStatus = 'idle';
        return;
      }

      const activeProviders = this.providers.filter((p) => this.enabledCategories.has(p.id));

      const exportDataMap = new Map<string, SyncProviderData>();
      const categories: ProfileCategoryEntry[] = [];
      const binaryAssets: ProfileAssetEntry[] = [];

      for (const p of activeProviders) {
        const data = await p.exportFull();
        exportDataMap.set(p.id, data);
        categories.push({
          filename: `${p.id}.json`,
          json_content: JSON.stringify(data.data),
          sensitive_field_paths: p.sensitiveFields ?? [],
        });
      }

      let appVersion = '0.1.0';
      try {
        appVersion = await getVersion();
      } catch {
        // Fallback
      }

      const manifest = profileService.buildManifest(exportDataMap, this.exportPassword || null);
      manifest.appVersion = appVersion;

      await exportProfile(
        JSON.stringify(manifest),
        categories,
        binaryAssets,
        this.exportPassword || null,
        filePath,
      );

      this.exportStatus = 'success';
      this.exportMessage = 'Backup saved successfully.';
      this.exportPassword = '';
    } catch (err) {
      logService.warn(`Export failed: ${err}`);
      this.exportStatus = 'error';
      this.exportMessage = `Export failed: ${err}`;
    }
  }

  async handleChooseFile(): Promise<void> {
    this.importStatus = 'idle';
    this.importMessage = '';
    this.importNeedsPassword = false;
    this.importPassword = '';

    const filePath = await showOpenProfileDialog();
    if (!filePath) return;

    this.importFile = filePath;
    await this._loadArchive(filePath, null);
  }

  async handleFileWithPassword(): Promise<void> {
    if (!this.importFile || !this.importPassword) return;
    await this._loadArchive(this.importFile, this.importPassword);
  }

  private async _loadArchive(filePath: string, password: string | null): Promise<void> {
    this.importStatus = 'importing';
    this.importMessage = '';

    try {
      const contents = await importProfile(filePath, password);
      if (!contents) {
        throw new Error('Failed to read profile contents');
      }
      this._importContents = contents;

      const manifest: ArchiveManifest = JSON.parse(contents.manifest_json);

      // An encrypted archive without a password can't be previewed yet — ask
      // for the password instead of opening the (empty) import modal.
      const encrypted =
        manifest.encryptionScheme !== null && manifest.encryptionScheme !== undefined;
      if (encrypted && !password) {
        this.importNeedsPassword = true;
        this.importStatus = 'idle';
        this.importModalOpen = false;
        return;
      }

      this.importManifest = manifest;

      const catMap = new Map<string, { enabled: boolean; strategy: ConflictStrategy }>();
      const previewMap = new Map<string, ImportPreview>();

      for (const cat of manifest.categories) {
        const provider = profileService.getProviderById(cat.id);
        if (provider) {
          catMap.set(cat.id, {
            enabled: true,
            strategy: provider.defaultConflictStrategy,
          });

          const rawData =
            contents.category_files[cat.file] || contents.category_files[`${cat.id}.json`];
          if (rawData) {
            try {
              const dataPayload = JSON.parse(rawData);
              const preview = await provider.preview({
                providerId: cat.id,
                version: cat.providerVersion,
                exportedAt: manifest.exportedAt,
                data: dataPayload,
              });
              previewMap.set(cat.id, preview);
            } catch (err) {
              logService.warn(`Preview failed for ${cat.id}: ${err}`);
            }
          }
        }
      }

      this.importCategories = catMap;
      this.importPreviewData = previewMap;
      this.importNeedsPassword = false;
      this.importStatus = 'idle';
      this.importModalOpen = true;
    } catch (err: any) {
      const msg = String(err);
      if (
        msg.includes('IncorrectPassword') ||
        msg.includes('DecryptionFailed') ||
        msg.includes('encryption')
      ) {
        this.importNeedsPassword = true;
        this.importStatus = 'error';
        this.importMessage = 'Incorrect password. Please try again.';
      } else if (msg.includes('InvalidArchive') || msg.includes('VersionIncompatible')) {
        this.importStatus = 'error';
        this.importMessage = `Cannot read backup: ${msg}`;
      } else {
        this.importStatus = 'error';
        this.importMessage = `Failed to open backup: ${msg}`;
      }
    }
  }

  closeImportModal(): void {
    this.importModalOpen = false;
    this.importFile = '';
    this.importStatus = 'idle';
    this.importMessage = '';
    this.importNeedsPassword = false;
    this.importPassword = '';
    this.importManifest = null;
    this.importCategories = new Map();
    this.importPreviewData = new Map();
    this._importContents = null;
  }

  async handleImport(): Promise<void> {
    if (this.importStatus === 'importing' || !this._importContents || !this.importManifest) return;

    this.importStatus = 'importing';
    this.importMessage = '';

    try {
      for (const cat of this.importManifest.categories) {
        const catConfig = this.importCategories.get(cat.id);
        if (!catConfig?.enabled || catConfig.strategy === 'skip') continue;

        const provider = profileService.getProviderById(cat.id);
        const rawData =
          this._importContents.category_files[cat.file] ||
          this._importContents.category_files[`${cat.id}.json`];
        if (provider && rawData) {
          const dataPayload = JSON.parse(rawData);
          await provider.applyImport(
            {
              providerId: cat.id,
              version: cat.providerVersion,
              exportedAt: this.importManifest.exportedAt,
              data: dataPayload,
            },
            catConfig.strategy,
          );
        }
      }

      this.importStatus = 'success';
      this.importModalOpen = false;
      this.importMessage = 'Backup restored successfully.';
      this.importPassword = '';
      this._importContents = null;

      await emit('asyar:stores-restored');
    } catch (err) {
      logService.warn(`Import failed: ${err}`);
      this.importStatus = 'error';
      this.importMessage = `Restore failed: ${err}`;
    }
  }
}
