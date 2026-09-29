import { invoke, useSettingsState } from '@/bridge';
import { toastResult } from '@/feedback';
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
import { Button } from '@/components/ui/button';
import type { SettingsPendingConsent } from '@/types';

/**
 * The consent dialogs, replacing the native ConsentDialog: a pending install
 * (from "Install from file…") or a pending re-consent (from "Review
 * permissions") arrives as SettingsState.pending*, and the page renders the
 * full capability list. The page can only confirm or cancel — the shell
 * builds the stored consent record from its own inspected plan, so the page
 * can never grant capabilities the manifest doesn't declare.
 */
export function ConsentDialogs() {
  const state = useSettingsState();
  if (!state) {
    return null;
  }
  if (state.pendingInstall) {
    return <ConsentBody pending={state.pendingInstall} isReconsent={false} />;
  }
  if (state.pendingReconsent) {
    return <ConsentBody pending={state.pendingReconsent} isReconsent={true} />;
  }
  return null;
}

function ConsentBody({
  pending,
  isReconsent,
}: {
  pending: SettingsPendingConsent;
  isReconsent: boolean;
}) {
  const confirmOp = isReconsent ? 'confirmPendingReconsent' : 'confirmPendingInstall';
  const cancelOp = isReconsent ? 'cancelPendingReconsent' : 'cancelPendingInstall';
  return (
    <AlertDialog open={true}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isReconsent ? `Review permissions for ${pending.name}` : `Install ${pending.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isReconsent
              ? `${pending.name} v${pending.version} is asking to keep the following permissions.`
              : `${pending.name} v${pending.version} requests the following permissions before installation.`}
            {pending.description ? ` ${pending.description}` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <CapabilityList pending={pending} />
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={() => void invoke(cancelOp)}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              onClick={() =>
                void invoke(confirmOp).then((result) =>
                  toastResult(result, isReconsent ? `Permissions updated for ${pending.name}` : ''),
                )
              }
            >
              {isReconsent ? 'Update permissions' : 'Install'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CapabilityList({ pending }: { pending: SettingsPendingConsent }) {
  const groups: Array<{ title: string; items: string[] }> = [
    { title: 'Native capabilities', items: pending.nativeMethods },
    { title: 'Network hosts', items: pending.httpHosts },
    { title: 'Connected accounts', items: pending.oauth },
    { title: 'Filesystem access', items: pending.fsPaths },
    { title: 'Link schemes', items: pending.uriSchemes },
  ].filter((group) => group.items.length > 0);
  const quiet = groups.length === 0 && !pending.hasWebUi && pending.manifestWarnings.length === 0;
  return (
    <div className="my-4 max-h-64 overflow-y-auto rounded-sm border border-keycap-border bg-surface-alt p-3 text-xs">
      {quiet ? (
        <div className="text-text-tertiary">This extension requests no special permissions.</div>
      ) : (
        groups.map((group) => (
          <div key={group.title} className="mb-2 last:mb-0">
            <div className="font-medium text-foreground mb-1">{group.title}</div>
            <ul className="list-disc pl-4 text-text-secondary space-y-0.5 break-all">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))
      )}
      {pending.hasWebUi && (
        <div className="text-text-secondary">
          This extension renders a web interface inside FlowKey. It cannot access the OS except
          through the capabilities listed above.
        </div>
      )}
      {pending.manifestWarnings.map((warning) => (
        <div key={warning} className="mt-1 text-destructive">
          Warning: {warning}
        </div>
      ))}
    </div>
  );
}
