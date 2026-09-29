import { invoke } from '@/bridge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SettingsRow, SectionTitle, PageHint } from '@/components/settings-row';
import { useState } from 'react';
import type { SettingsInstalledRow, SettingsState } from '@/types';

/**
 * Extensions page, ported from BuildExtensionsPage: install from file,
 * load failures, and installed-package management. Preference forms live on
 * each extension's detail page in the sidebar. Uninstall confirmation is the
 * web alert dialog (the shell still performs the purge).
 */
export function ExtensionsPage({ state }: { state: SettingsState }) {
  const [confirmUninstall, setConfirmUninstall] = useState<SettingsInstalledRow | null>(null);
  return (
    <div>
      <PageHint>Installed extensions and their preferences.</PageHint>

      <SectionTitle>Add extensions</SectionTitle>
      <SettingsRow
        title="Install from file"
        description="Add a .flowkey extension package built with the FlowKey SDK"
        control={
          <Button onClick={() => void invoke('pickExtensionPackage')}>Install from file…</Button>
        }
      />

      {state.extensions.loadFailures.length > 0 && (
        <>
          <SectionTitle>Failed to load</SectionTitle>
          {state.extensions.loadFailures.map((failure) => (
            <div key={failure.id} className="text-xs text-text-secondary mb-1 break-words">
              {failure.id} — {failure.message}
            </div>
          ))}
        </>
      )}

      {state.extensions.installed.length > 0 && (
        <>
          <SectionTitle>Installed packages</SectionTitle>
          {state.extensions.installed.map((record) => (
            <SettingsRow
              key={record.id}
              title={record.name}
              description={`v${record.version} · id ${record.id} · ${record.enabled ? 'enabled' : 'disabled'}`}
              control={
                <>
                  <Switch
                    checked={record.enabled}
                    title={record.enabled ? 'Disable extension' : 'Enable extension'}
                    onCheckedChange={(checked) =>
                      void invoke('setExtensionEnabled', {
                        extensionId: record.id,
                        enabled: checked,
                      })
                    }
                  />
                  <Button
                    variant="outline"
                    title="Remove the extension and its data"
                    onClick={() => setConfirmUninstall(record)}
                  >
                    Uninstall
                  </Button>
                </>
              }
            />
          ))}
        </>
      )}

      <AlertDialog
        open={confirmUninstall !== null}
        onOpenChange={(open) => !open && setConfirmUninstall(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall extension</AlertDialogTitle>
            <AlertDialogDescription>
              Uninstall “{confirmUninstall?.name}” and delete its data (storage, secrets and
              connected accounts)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">No</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirmUninstall) {
                    void invoke('uninstallExtension', { extensionId: confirmUninstall.id });
                  }
                  setConfirmUninstall(null);
                }}
              >
                Uninstall
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
