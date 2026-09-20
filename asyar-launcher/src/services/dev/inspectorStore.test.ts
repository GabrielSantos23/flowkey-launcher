import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock('../log/logService', () => ({
  logService: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    custom: vi.fn(),
  },
}));
vi.mock('../settings/developerSettingsService', () => ({
  developerSettingsService: { isDeveloperMode: true },
}));
vi.mock('../extension/extensionManager', () => ({
  default: { getManifestById: vi.fn(() => undefined) },
}));

import { inspectorStore } from './inspectorStore';

describe('inspectorStore', () => {
  it('starts with isOpen=false, no selection, runtime tab default', () => {
    expect(inspectorStore.isOpen).toBe(false);
    expect(inspectorStore.selectedExtensionId).toBeNull();
    expect(inspectorStore.activeTab).toBe('runtime');
    expect(inspectorStore.runtimeMap).toEqual({});
  });

  it('toggle flips isOpen', () => {
    inspectorStore.isOpen = false;
    inspectorStore.toggle();
    expect(inspectorStore.isOpen).toBe(true);
    inspectorStore.toggle();
    expect(inspectorStore.isOpen).toBe(false);
  });
});
