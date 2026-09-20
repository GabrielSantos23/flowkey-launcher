import React from 'react';
import { Icon } from '../react/Icon';
import { IconButton, IconBox } from '../react/Interactive';
import { Badge } from '../react/Badge';
import { developmentBuildIndicator } from '../../lib/developmentBuild';

export interface SettingsSidebarTab {
  id: string;
  label: string;
  icon: string;
  /** Group header this tab renders under; ungrouped tabs render above every group. */
  group?: string;
}

export interface SettingsSidebarProps {
  tabs: SettingsSidebarTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const FOOTER_TAB_IDS = ['about'];

export default function SettingsSidebar({
  tabs,
  activeTab,
  onTabChange,
  open,
  onClose,
  onOpen,
}: SettingsSidebarProps) {
  const mainTabs = tabs.filter((tab) => !FOOTER_TAB_IDS.includes(tab.id));
  const footerTabs = tabs.filter((tab) => FOOTER_TAB_IDS.includes(tab.id));

  const groups: { label: string | null; tabs: SettingsSidebarTab[] }[] = [];
  for (const tab of mainTabs) {
    const last = groups[groups.length - 1];
    if (last && last.label === (tab.group ?? null)) {
      last.tabs.push(tab);
    } else {
      groups.push({ label: tab.group ?? null, tabs: [tab] });
    }
  }

  const renderTab = (tab: SettingsSidebarTab) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        className={`settings-sidebar-item flex items-center gap-[var(--space-3)] w-full px-[var(--space-3)] py-[var(--space-2)] cursor-pointer border-0 rounded-[var(--radius-md)] transition-colors duration-[var(--dur-instant)] ease-[var(--ease-travel)] ${
          isActive
            ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
            : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
        role="tab"
        aria-selected={isActive}
        onClick={() => onTabChange(tab.id)}
      >
        <Icon name={tab.icon} size={18} />
        <span className="text-[var(--font-size-sm)] font-medium truncate">{tab.label}</span>
      </button>
    );
  };

  return (
    <>
      {/* Floating panel. It stays mounted so the slide-out plays on close;
          pointer events are cut while hidden. */}
      <aside
        aria-hidden={!open}
        aria-label="Settings sections"
        className={`settings-sidebar absolute top-[var(--space-3)] bottom-[var(--space-3)] left-[var(--space-3)] w-60 flex flex-col rounded-[var(--radius-popup)] bg-[var(--bg-secondary)] shadow-[var(--shadow-launcher-popup)] z-[var(--z-overlay)] ${
          open
            ? 'translate-x-0 opacity-100 duration-[var(--dur-travel)] ease-[var(--ease-travel)]'
            : '-translate-x-[110%] opacity-0 pointer-events-none duration-[var(--dur-travel)] ease-[var(--ease-recede)]'
        } transition-[transform,opacity]`}
      >
        <div className="flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-4)]">
          <IconBox size="sm">
            <Icon name="settings" size={16} />
          </IconBox>
          <span className="text-[var(--font-size-md)] font-semibold text-[var(--text-primary)] flex-1 truncate">
            Settings
          </span>
          <IconButton onClick={onClose} ariaLabel="Close sidebar" title="Close sidebar" size="sm">
            <Icon name="close" size={16} />
          </IconButton>
        </div>

        <nav
          className="flex-1 overflow-y-auto custom-scrollbar px-[var(--space-2)] pb-[var(--space-2)] flex flex-col gap-[var(--space-0-5)]"
          role="tablist"
        >
          {groups.map((group, groupIndex) => (
            <div
              key={group.label ?? `ungrouped-${groupIndex}`}
              className="flex flex-col gap-[var(--space-0-5)]"
            >
              {group.label ? (
                <div className="section-header px-[var(--space-3)] pt-[var(--space-3)] pb-[var(--space-1)]">
                  {group.label}
                </div>
              ) : null}
              {group.tabs.map(renderTab)}
            </div>
          ))}
        </nav>

        {developmentBuildIndicator ? (
          <div className="px-[var(--space-4)] pb-[var(--space-2)]">
            <Badge text={developmentBuildIndicator.text} variant="warning" mono bordered />
          </div>
        ) : null}

        {footerTabs.length > 0 ? (
          <div className="px-[var(--space-2)] pb-[var(--space-2)] pt-[var(--space-2)] border-t border-[var(--separator)] flex flex-col gap-[var(--space-0-5)]">
            {footerTabs.map(renderTab)}
          </div>
        ) : null}
      </aside>

      {/* Reopen handle, shown only while the panel is collapsed. */}
      {!open ? (
        <div className="absolute top-[var(--space-3)] left-[var(--space-3)] z-[var(--z-overlay)]">
          <IconButton
            onClick={onOpen}
            ariaLabel="Open sidebar"
            title="Open sidebar"
            className="rounded-[var(--radius-full)] bg-[var(--bg-secondary)] shadow-[var(--shadow-xs)]"
          >
            <Icon name="panel-left" size={16} />
          </IconButton>
        </div>
      ) : null}
    </>
  );
}
