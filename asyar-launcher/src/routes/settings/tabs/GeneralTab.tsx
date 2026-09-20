import React, { useState, useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { normalizeShortcut } from '../../../built-in-features/shortcuts/shortcutFormatter';
import { shortcutService } from '../../../built-in-features/shortcuts/shortcutService';
import AppearanceThemeSelector from '../../../components/settings/AppearanceThemeSelector';
import { Button } from '../../../components/react/Buttons';
import { Checkbox, Toggle } from '../../../components/react/Inputs';
import SegmentedControl from '../../../components/base/SegmentedControl';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRangeSlider from '../../../components/settings/SettingsRangeSlider';
import SettingsRow from '../../../components/settings/SettingsRow';
import ShortcutRecorder from '../../../components/base/ShortcutRecorder';
import WindowModeSelector from '../../../components/settings/WindowModeSelector';
import { discoverExtensions, onboardingCommands } from '../../../lib/ipc/commands';
import { feedbackService } from '../../../services/feedback/feedbackService';

import { launcherPlacementService } from '../../../services/launcher/launcherPlacementService';
import { logService } from '../../../services/log/logService';
import { settingsService } from '../../../services/settings/settingsService';
import { applyTheme, removeTheme } from '../../../services/theme/themeService';
import type { SettingsHandler } from '../settingsHandlers';

export interface GeneralTabProps {
  handler: SettingsHandler;
}

export default function GeneralTab({ handler }: GeneralTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [themeExtensions, setThemeExtensions] = useState<
    Array<{ id: string; name: string; author?: string; version: string }>
  >([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);

  useEffect(() => {
    launcherPlacementService
      .load()
      .then(() => rerender())
      .catch((e) => logService.error(`Failed to load launcher placement: ${e}`));

    discoverExtensions()
      .then((records) => {
        const themes = (records ?? [])
          .filter((r: any) => r.manifest.type === 'theme' && r.enabled)
          .map((r: any) => ({
            id: r.manifest.id,
            name: r.manifest.name,
            author: r.manifest.author ?? undefined,
            version: r.manifest.version,
          }));
        setThemeExtensions(themes);
        setActiveThemeId(handler.settings?.appearance?.activeTheme ?? null);
      })
      .catch((e) => {
        logService.error(`Failed to load theme extensions: ${e}`);
        feedbackService.report({
          source: 'frontend',
          kind: 'manual',
          severity: 'warning',
          retryable: false,
          context: { message: 'Could not load theme extensions list' },
        });
      });
  }, [handler.settings?.appearance?.activeTheme]);

  const conflictChecker = async (shortcut: string): Promise<{ name: string } | null> => {
    const conflict = await shortcutService.isConflict(normalizeShortcut(shortcut), 'launcher');
    if (conflict) return { name: conflict.itemName };
    return null;
  };

  const handleSave = async (detail: { modifier: string; key: string }): Promise<string | true> => {
    handler.selectedModifier = detail.modifier;
    handler.selectedKey = detail.key;
    handler.isSaving = true;
    handler.saveMessage = '';
    handler.saveError = false;

    try {
      const { updateShortcut } = await import('../../../utils/shortcutManager');
      const success = await updateShortcut(detail.modifier, detail.key);
      handler.isSaving = false;
      rerender();
      if (success) return true;
      return 'Cannot save, shortcut may be reserved by the OS or another app';
    } catch {
      handler.isSaving = false;
      rerender();
      return 'Cannot save, shortcut may be reserved by the OS or another app';
    }
  };

  const placement = launcherPlacementService;

  const updatePlacement = async (change: () => Promise<void>, what: string) => {
    try {
      await change();
      rerender();
    } catch (error) {
      logService.error(`Failed to update launcher ${what}: ${error}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not save the launcher ${what}` },
      });
    }
  };

  const selectLaunchView = async (launchView: 'default' | 'compact') => {
    await handler.updateLaunchView(launchView);
    await emit('asyar:launch-view-changed', { launchView });
    rerender();
  };

  const rerunOnboarding = async () => {
    try {
      await onboardingCommands.reset();
    } catch (e) {
      logService.error(`Failed to re-run onboarding: ${e}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: 'Could not re-run onboarding' },
      });
    }
  };

  const selectTheme = async (themeId: string | null) => {
    try {
      if (themeId) {
        await applyTheme(themeId);
      } else {
        removeTheme();
      }
      setActiveThemeId(themeId);
      await settingsService.updateSettings('appearance', { activeTheme: themeId });
      await emit('asyar:theme-changed', { themeId });
      rerender();
    } catch (error) {
      logService.error(`Failed to apply theme ${themeId}: ${error}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: {
          message: themeId ? `Could not apply theme "${themeId}"` : 'Could not remove active theme',
        },
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Startup'}
        </div>
        <SettingsCard>
          <div id="general-startup">
            <SettingsRow
              label={'Launch at Login'}
              description={'Automatically start Flowkey when your computer boots'}
            >
              <Checkbox
                checked={handler.settings.general.startAtLogin}
                onChange={() => {
                  handler.handleAutostartToggle();
                  rerender();
                }}
              />
            </SettingsRow>
            <SettingsRow
              label={'Launcher Hotkey'}
              description={'Global keyboard shortcut to summon Flowkey'}
            >
              <ShortcutRecorder
                modifier={handler.selectedModifier}
                keyName={handler.selectedKey}
                placeholder={'Click to set shortcut'}
                disabled={handler.isSaving}
                onsave={handleSave}
                conflictChecker={conflictChecker}
              />
            </SettingsRow>
            <SettingsRow
              label={'Show icon in menu bar'}
              description={
                handler.settings.general.showTrayIcon
                  ? 'Keep Flowkey accessible from the system menu bar'
                  : 'When hidden, you can still open Flowkey with your global hotkey or search for Settings.'
              }
            >
              <Checkbox
                checked={handler.settings.general.showTrayIcon}
                onChange={() => {
                  handler.handleTrayIconToggle();
                  rerender();
                }}
              />
            </SettingsRow>
          </div>
        </SettingsCard>
      </div>

      <div>
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Appearance'}
        </div>
        <SettingsCard>
          <div id="general-appearance">
            <SettingsRow label={'Theme'} description={'Match the system or lock one appearance.'}>
              <AppearanceThemeSelector
                value={handler.selectedTheme as 'light' | 'dark' | 'system'}
                onchange={(v) => {
                  handler.updateThemeSetting(v);
                  rerender();
                }}
                wellBackground="secondary"
              />
            </SettingsRow>
            <SettingsRow
              label={'Window mode'}
              description={'How much of the launcher is visible before you type.'}
            >
              <WindowModeSelector
                value={handler.selectedLaunchView}
                onchange={selectLaunchView}
                wellBackground="primary"
              />
            </SettingsRow>
          </div>
        </SettingsCard>
      </div>

      <div>
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Placement'}
        </div>
        <SettingsCard>
          <div id="general-placement">
            <SettingsRow label={'Display'} description={'Which screen the launcher opens on.'}>
              <SegmentedControl
                options={[
                  { value: 'cursor', label: 'Display with cursor' },
                  { value: 'primary', label: 'Primary display' },
                ]}
                value={placement.placement.monitor}
                onchange={(v) =>
                  updatePlacement(() => placement.setMonitor(v as 'cursor' | 'primary'), 'display')
                }
              />
            </SettingsRow>
            <SettingsRow
              label={'Vertical position'}
              description={'Drag the launcher itself to set a custom spot.'}
            >
              <SegmentedControl
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'center', label: 'Centre' },
                  { value: 'custom', label: 'Custom' },
                ]}
                value={placement.vertical ?? ''}
                onchange={(v) =>
                  updatePlacement(
                    () => placement.setVertical(v as 'top' | 'center' | 'custom'),
                    'position',
                  )
                }
              />
            </SettingsRow>
            {placement.vertical === 'custom' ? (
              <SettingsRow label={'Distance from top'}>
                <SettingsRangeSlider
                  min={0}
                  max={100}
                  value={placement.biasPercent}
                  suffix="%"
                  onchange={(v) => updatePlacement(() => placement.setBias(v), 'position')}
                />
              </SettingsRow>
            ) : null}
            <SettingsRow
              label={'Snap while dragging'}
              description={'Snap to screen edges and centre lines.'}
            >
              <Toggle
                checked={placement.placement.snapEnabled}
                onChange={() =>
                  updatePlacement(
                    () => placement.setSnapEnabled(!placement.placement.snapEnabled),
                    'snap setting',
                  )
                }
              />
            </SettingsRow>
            {placement.isDragged ? (
              <SettingsRow
                label={'Custom position'}
                description={'Set by dragging the launcher. Stored relative to the display.'}
              >
                <Button onClick={() => updatePlacement(() => placement.reset(), 'position')}>
                  {'Reset'}
                </Button>
              </SettingsRow>
            ) : null}
          </div>
        </SettingsCard>
      </div>

      <SettingsCard>
        <div id="general-onboarding">
          <SettingsRow label={'Onboarding'} description={'Walk through the welcome flow again.'}>
            <Button onClick={rerunOnboarding}>{'Re-run onboarding'}</Button>
          </SettingsRow>
        </div>
      </SettingsCard>

      {themeExtensions.length > 0 ? (
        <div>
          <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            {'Custom Themes'}
          </div>
          <SettingsCard>
            <div className="flex flex-col">
              <label
                className={`p-4 border-b border-[var(--border-color)] last:border-b-0 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-hover)] ${
                  activeThemeId === null ? 'bg-[var(--bg-selected)]' : ''
                }`}
              >
                <input
                  type="radio"
                  name="custom-theme"
                  checked={activeThemeId === null}
                  onChange={() => selectTheme(null)}
                  className="sr-only"
                />
                <div className="flex flex-col">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{'Default'}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {'Built-in Flowkey theme'}
                  </div>
                </div>
              </label>

              {themeExtensions.map((theme) => (
                <label
                  key={theme.id}
                  className={`p-4 border-b border-[var(--border-color)] last:border-b-0 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-hover)] ${
                    activeThemeId === theme.id ? 'bg-[var(--bg-selected)]' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="custom-theme"
                    checked={activeThemeId === theme.id}
                    onChange={() => selectTheme(theme.id)}
                    className="sr-only"
                  />
                  <div className="flex flex-col">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {theme.name}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {theme.author ? `${theme.author} · ` : ''}v{theme.version}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </SettingsCard>
        </div>
      ) : null}
    </div>
  );
}
