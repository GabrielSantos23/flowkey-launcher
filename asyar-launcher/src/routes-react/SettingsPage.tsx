import React, { useState, useEffect, useRef } from 'react';
import { LoadingState } from '../components/react/Feedback';
import SettingsSidebar, { SettingsSidebarTab } from '../components/settings/SettingsSidebar';
import SettingsPageHeader from '../components/settings/SettingsPageHeader';
import SettingsTitleBar from '../components/settings/SettingsTitleBar';
import { SettingsHandler } from '../routes/settings/settingsHandlers';
import GeneralTab from '../routes/settings/tabs/GeneralTab';
import ApplicationsTab from '../routes/settings/tabs/ApplicationsTab';
import FileSearchTab from '../routes/settings/tabs/FileSearchTab';
import ScriptsTab from '../routes/settings/tabs/ScriptsTab';
import ExtensionsTab from '../routes/settings/tabs/ExtensionsTab';
import { TabErrorBoundary } from './TabErrorBoundary';
import AboutTab from '../routes/settings/tabs/AboutTab';
import BackupTab from '../routes/settings/tabs/BackupTab';
import AccountTab from '../routes/settings/tabs/AccountTab';
import AdvancedTab from '../routes/settings/tabs/AdvancedTab';
import DeveloperTab from '../routes/settings/tabs/DeveloperTab';
import PrivacyTab from '../routes/settings/tabs/PrivacyTab';
import BrowsersTab from '../routes/settings/tabs/BrowsersTab';
import { authService } from '../services/auth/authService';
import { registerProfileProviders } from '../services/appInitializer';
import { cloudSyncService } from '../services/sync/cloudSyncService';
import { shortcutStore } from '../built-in-features/shortcuts/shortcutStore';
import { initValidKeys } from '../built-in-features/shortcuts/shortcutFormatter';
import { listen } from '@tauri-apps/api/event';

const SIDEBAR_OPEN_KEY = 'settings.sidebarOpen';

const SIDEBAR_WIDTH = 240; // the floating panel's w-60
const SIDEBAR_INSET = 12; // --space-3 on each side of the floating panel

const settingsTabs: (SettingsSidebarTab & { description?: string })[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  {
    id: 'extensions',
    label: 'Extensions',
    icon: 'puzzle',
    group: 'Manage',
  },
  { id: 'browsers', label: 'Browsers', icon: 'globe', group: 'Manage' },
  { id: 'applications', label: 'Applications', icon: 'layers', group: 'Manage' },
  { id: 'file-search', label: 'File Search', icon: 'folder-search', group: 'Manage' },
  { id: 'scripts', label: 'Scripts', icon: 'dev-tools', group: 'Manage' },
  { id: 'backup', label: 'Backup', icon: 'cloud-upload', group: 'System' },
  { id: 'account', label: 'Account', icon: 'user', group: 'System' },
  { id: 'privacy', label: 'Privacy', icon: 'lock', group: 'System' },
  { id: 'advanced', label: 'Advanced', icon: 'sliders', group: 'System' },
  { id: 'developer', label: 'Developer', icon: 'dev-tools', group: 'System' },
  { id: 'about', label: 'About', icon: 'info' },
];

export default function SettingsPage() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const handlerRef = useRef<SettingsHandler | null>(null);
  if (!handlerRef.current) {
    handlerRef.current = new SettingsHandler();
  }
  const handler = handlerRef.current;

  const [activeTab, setActiveTab] = useState(handler.activeTab);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_OPEN_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    handler.init().then(() => rerender());
    void authService.init();
    void shortcutStore.init();
    void initValidKeys();
    registerProfileProviders();
    cloudSyncService.checkStatus().catch(() => {});

    let unlistenNavTab: (() => void) | undefined;
    listen<{ tab: string; extensionId?: string | null }>('asyar:navigate-settings-tab', (e) => {
      handler.activeTab = e.payload.tab;
      setActiveTab(e.payload.tab);
      if (e.payload.extensionId) {
        handler.pendingExtensionSelection = e.payload.extensionId;
      }
      rerender();
    }).then((fn) => {
      unlistenNavTab = fn;
    });

    return () => {
      handler.destroy();
      unlistenNavTab?.();
    };
  }, []);

  const visibleTabs: SettingsSidebarTab[] = settingsTabs.filter(
    (tab) => tab.id !== 'developer' || handler.settings.developer?.enabled,
  );

  const activeTabDef = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];

  const handleTabChange = (tabId: string) => {
    handler.activeTab = tabId;
    setActiveTab(tabId);
    rerender();
  };

  const toggleSidebar = (open: boolean) => {
    setSidebarOpen(open);
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
    } catch {
      // Persistence is best-effort; the state still applies for this session.
    }
  };

  if (handler.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <LoadingState message="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="settings-page relative flex h-screen bg-[var(--bg-primary)] overflow-hidden">
      <SettingsSidebar
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        open={sidebarOpen}
        onClose={() => toggleSidebar(false)}
        onOpen={() => toggleSidebar(true)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <SettingsTitleBar />
        <main
          className={`flex-1 overflow-y-auto custom-scrollbar transition-[padding] duration-[var(--dur-travel)] ease-[var(--ease-travel)] ${
            activeTab === 'extensions' ? 'p-0 overflow-hidden' : 'p-6'
          }`}
          style={{ paddingLeft: sidebarOpen ? SIDEBAR_WIDTH + SIDEBAR_INSET : SIDEBAR_INSET }}
        >
          <div
            className={`mx-auto flex flex-col gap-[var(--space-6)] ${
              activeTab === 'extensions'
                ? 'max-w-none m-0 h-full gap-0'
                : activeTab === 'applications'
                  ? 'max-w-[900px]'
                  : 'max-w-[820px]'
            }`}
          >
            {handler.initError ? (
              <div className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--accent-warning)_15%,var(--bg-primary))] text-[var(--text-primary)] text-xs">
                ⚠️ {handler.initError}
              </div>
            ) : null}

            {activeTab !== 'extensions' ? (
              <SettingsPageHeader
                icon={activeTabDef.icon}
                title={activeTabDef.label}
                description={activeTabDef.description}
              />
            ) : null}

            {activeTab === 'general' && <GeneralTab handler={handler} />}
            {activeTab === 'extensions' && (
              <TabErrorBoundary tab="extensions">
                <ExtensionsTab handler={handler} />
              </TabErrorBoundary>
            )}
            {activeTab === 'browsers' && <BrowsersTab />}
            {activeTab === 'applications' && <ApplicationsTab />}
            {activeTab === 'file-search' && <FileSearchTab />}
            {activeTab === 'scripts' && <ScriptsTab />}
            {activeTab === 'backup' && <BackupTab handler={handler} />}
            {activeTab === 'account' && <AccountTab handler={handler} />}
            {activeTab === 'privacy' && <PrivacyTab />}
            {activeTab === 'advanced' && <AdvancedTab handler={handler} />}
            {activeTab === 'developer' && <DeveloperTab handler={handler} />}
            {activeTab === 'about' && <AboutTab handler={handler} />}
          </div>
        </main>
      </div>
    </div>
  );
}
