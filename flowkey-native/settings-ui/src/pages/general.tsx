import { invoke } from '@/bridge';
import { toastResult } from '@/feedback';
import { toast } from 'sonner';
import { RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsRow, SectionTitle, ComboChips } from '@/components/settings-row';
import { UpdateSection } from '@/components/update-section';
import type { SettingsState } from '@/types';

/** General page, ported from BuildGeneralPage. */
export function GeneralPage({ state }: { state: SettingsState }) {
  return (
    <div>
      <SettingsRow
        title="Open at Login"
        description="Start FlowKey when you log in"
        control={
          <Switch
            checked={state.general.openAtLogin}
            onCheckedChange={(checked) =>
              void invoke('setOpenAtLogin', { enabled: checked }).then((result) =>
                toastResult(
                  result,
                  checked ? 'FlowKey will start at login' : 'FlowKey will not start at login',
                ),
              )
            }
          />
        }
      />
      <SettingsRow
        title="Show in System Tray"
        description="Keep FlowKey in the system tray"
        disabled={true}
        control={<Switch checked={false} disabled={true} />}
      />

      <SectionTitle>Launcher</SectionTitle>
      <SettingsRow
        title="FlowKey Hotkey"
        description="Click the field and press a combination. Escape cancels."
        control={
          <>
            <Button
              variant="outline"
              title="Record a new hotkey"
              onClick={() => void invoke('beginHotkeyCapture', { scope: 'summon' })}
            >
              <ComboChips combo={state.general.summonHotkey} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Reset to Ctrl+Alt+Space"
              onClick={() =>
                void invoke('resetSummonHotkey').then((result) =>
                  toastResult(result, 'Hotkey reset to Ctrl+Alt+Space'),
                )
              }
            >
              <RotateCcwIcon />
            </Button>
          </>
        }
      />

      <SectionTitle>Maintenance</SectionTitle>
      <SettingsRow
        title="Clipboard History"
        description="Erase every stored clipboard entry"
        control={
          <Button
            onClick={() =>
              void invoke('clearClipboardHistory').then((result) =>
                toastResult(result, 'Clipboard history cleared'),
              )
            }
          >
            Clear clipboard history
          </Button>
        }
      />
      <SettingsRow
        title="Check for Updates Automatically"
        description="Look for new versions every 6 hours"
        control={
          <Switch
            checked={state.general.autoUpdateCheck}
            onCheckedChange={(checked) => void invoke('setAutoUpdateCheck', { enabled: checked })}
          />
        }
      />

      <UpdateSection status={state.update} />
    </div>
  );
}
