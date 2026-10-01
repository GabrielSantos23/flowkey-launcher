import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@/bridge';
import { toastResult } from '@/feedback';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  SettingsRow,
  SectionTitle,
  ComboChips,
  ClearHotkeyButton,
} from '@/components/settings-row';
import { ExtensionIcon } from '@/components/extension-icon';
import { PreferenceFieldRow } from '@/components/preference-field';
import { currentRecorderError, subscribeRecorderErrors } from '@/recorder-errors';
import type {
  PreferenceDraft,
  PreferenceValue,
  SettingsExtensionDetail,
  SettingsState,
} from '@/types';

/**
 * Extension detail page, ported from BuildExtensionDetailPage: header with
 * brand mark, installed-package management (zip installs), OAuth connections,
 * the full preference form, and per-command shortcut + toggle rows.
 */
export function ExtensionDetailPage({
  state,
  extensionId,
}: {
  state: SettingsState;
  extensionId: string;
}) {
  const detail = state.details[extensionId];
  if (!detail) {
    return <div className="text-xs text-text-tertiary">This extension is not loaded.</div>;
  }
  return (
    <div>
      <DetailHeader detail={detail} />
      {detail.isZipInstalled && (
        <>
          <SectionTitle>Installed package</SectionTitle>
          <SettingsRow
            title="Manage"
            description={`v${detail.version} · installed ${detail.installedAt ?? ''}`}
            control={
              <>
                <Switch
                  checked={detail.zipEnabled}
                  title={detail.zipEnabled ? 'Disable extension' : 'Enable extension'}
                  onCheckedChange={(checked) =>
                    void invoke('setExtensionEnabled', { extensionId: detail.id, enabled: checked })
                  }
                />
                <Button
                  variant="outline"
                  onClick={() => void invoke('reviewPermissions', { extensionId: detail.id })}
                >
                  Review permissions
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void invoke('uninstallExtension', { extensionId: detail.id })}
                >
                  Uninstall
                </Button>
              </>
            }
          />
        </>
      )}

      {detail.oauth.map((row) => (
        <OAuthRowView key={row.provider} extensionId={detail.id} row={row} />
      ))}

      <SettingsRow
        title="Close window on action"
        description="If enabled, the FlowKey window will be closed after performing an action"
        disabled={true}
        control={<Switch checked={false} disabled={true} />}
      />

      {detail.preferences.length > 0 && <PreferenceForm detail={detail} />}

      {detail.commands.length > 0 && (
        <>
          <SectionTitle>Commands</SectionTitle>
          {detail.commands.map((command) => (
            <CommandRowView
              key={command.commandKey}
              detail={detail}
              command={command}
              capture={state.capture}
            />
          ))}
        </>
      )}
    </div>
  );
}

function DetailHeader({ detail }: { detail: SettingsExtensionDetail }) {
  const [expanded, setExpanded] = useState(false);
  const description = detail.description ?? '';
  const truncated = description.length > 96 && !expanded;
  return (
    <div className="flex flex-col items-center text-center mt-1 mb-3.5">
      <div className="flex size-13 items-center justify-center rounded-md bg-card mb-2.5">
        <ExtensionIcon icon={detail.icon} className="size-8" />
      </div>
      <div className="text-2xl font-semibold text-foreground">{detail.name}</div>
      {description.length > 0 && (
        <div className="text-[13px] text-text-secondary mt-1.5 max-w-[560px] break-words">
          {truncated ? description.slice(0, 93) + '…' : description}
        </div>
      )}
      {description.length > 96 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </Button>
      )}
      <div className="text-xs text-text-tertiary mt-1">v{detail.version}</div>
    </div>
  );
}

function OAuthRowView({
  extensionId,
  row,
}: {
  extensionId: string;
  row: SettingsExtensionDetail['oauth'][number];
}) {
  const providerLabel = row.provider.charAt(0).toUpperCase() + row.provider.slice(1);
  const connected = row.status === 'connected';
  const authorizing = row.status === 'authorizing';
  const onOAuthClick = async () => {
    const result = await invoke(connected ? 'oauthDisconnect' : 'oauthAuthorize', {
      extensionId,
      provider: row.provider,
    });
    if (!result.ok) {
      toast.error(
        connected ? `Disconnect from ${providerLabel} failed` : `Login to ${providerLabel} failed`,
        {
          description: result.error,
        },
      );
    } else {
      toast.success(
        connected ? `Disconnected from ${providerLabel}` : `Connected to ${providerLabel}`,
      );
    }
  };
  return (
    <SettingsRow
      title={providerLabel}
      description={row.error ?? undefined}
      control={
        <Button
          disabled={authorizing || row.status === 'checking'}
          onClick={() => void onOAuthClick()}
        >
          {authorizing ? 'Waiting…' : connected ? 'Logout' : 'Login'}
        </Button>
      }
    >
      <div className="text-xs text-text-secondary mt-0.5">
        {authorizing
          ? `Waiting for ${providerLabel} authorization…`
          : row.status === 'checking'
            ? `Checking ${providerLabel} connection…`
            : connected
              ? `Logged into ${providerLabel}`
              : `Not connected to ${providerLabel}`}
      </div>
    </SettingsRow>
  );
}

function PreferenceForm({ detail }: { detail: SettingsExtensionDetail }) {
  // draft keyed per extension id so remounts across state pushes keep edits
  const [drafts, setDrafts] = useState<Record<string, PreferenceDraft>>({});
  const draft = useMemo<PreferenceDraft>(() => {
    const stored: PreferenceDraft = {};
    for (const field of detail.preferences) {
      stored[field.name] =
        field.value === true || field.value === false ? field.value : (field.value ?? '');
    }
    return { ...stored, ...drafts[detail.id] };
  }, [detail, drafts]);

  const onDraftChange = (name: string, value: PreferenceValue) => {
    setDrafts((current) => ({
      ...current,
      [detail.id]: { ...(current[detail.id] ?? {}), [name]: value },
    }));
  };

  const save = async () => {
    const values: Record<string, boolean | string> = {};
    for (const field of detail.preferences) {
      values[field.name] = draft[field.name] ?? (field.type === 'checkbox' ? false : '');
    }
    const result = await invoke('setPreferences', { extensionId: detail.id, values });
    toastResult(result, `${detail.name} preferences saved`);
    setDrafts((current) => ({ ...current, [detail.id]: {} }));
  };

  return (
    <>
      <SectionTitle>Preferences</SectionTitle>
      {detail.preferences.map((field) => (
        <PreferenceFieldRow
          key={field.name}
          field={field}
          draft={draft}
          onDraftChange={onDraftChange}
          appChoices={detail.appChoices}
        />
      ))}
      <div className="flex justify-end mt-1">
        <Button onClick={() => void save()}>Save preferences</Button>
      </div>
    </>
  );
}

function CommandRowView({
  detail,
  command,
  capture,
}: {
  detail: SettingsExtensionDetail;
  command: SettingsExtensionDetail['commands'][number];
  capture: SettingsState['capture'];
}) {
  const recording = capture?.scope === 'command' && capture.commandKey === command.commandKey;
  const error = useRecorderError(command.commandKey, recording);
  return (
    <div
      className={`bg-card rounded-lg px-3 py-2 mb-1 flex items-center gap-2 ${command.enabled ? '' : 'opacity-40'}`}
    >
      <ExtensionIcon icon={detail.icon} className="size-4 opacity-85 flex-none" />
      <span className="text-[13px] text-foreground truncate flex-1">{command.title}</span>
      <span className="text-xs text-text-tertiary px-3 flex-none" title="Not available yet">
        Add Alias
      </span>
      <div className="flex items-center gap-1.5 w-44 justify-center flex-none">
        <div className="group/keys flex items-center gap-0.5">
          <Button
            variant={recording ? 'default' : 'outline'}
            title={recording ? 'Recording…' : 'Click to record a shortcut'}
            onClick={() =>
              void invoke('beginHotkeyCapture', {
                scope: 'command',
                commandKey: command.commandKey,
              })
            }
          >
            {command.shortcut ? (
              <ComboChips combo={command.shortcut} />
            ) : (
              <span className="text-text-tertiary">Record Hotkey</span>
            )}
          </Button>
          <ClearHotkeyButton
            combo={command.shortcut}
            label="Remove shortcut"
            onClear={() =>
              void invoke('clearCommandShortcut', { commandKey: command.commandKey }).then(
                (result) => toastResult(result, 'Shortcut removed'),
              )
            }
          />
        </div>
        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </div>
      <div className="w-7 flex justify-center flex-none">
        <Switch
          checked={command.enabled}
          onCheckedChange={(checked) =>
            void invoke('toggleCommand', { commandKey: command.commandKey, enabled: checked })
          }
        />
      </div>
    </div>
  );
}

function useRecorderError(commandKey: string, recording: boolean): string | null {
  const [error, setError] = useState<string | null>(() => currentRecorderError(commandKey));
  useEffect(
    () =>
      subscribeRecorderErrors((sessionKey, sessionError) => {
        if (sessionKey === commandKey) {
          setError(sessionError);
        }
      }),
    [commandKey],
  );
  useEffect(() => {
    if (recording) {
      setError(null);
    }
  }, [recording]);
  return error;
}
