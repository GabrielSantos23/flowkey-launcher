import { useEffect, useRef, useState } from 'react';
import { invoke } from '@/bridge';
import { toast } from 'sonner';
import { ArrowDownToLineIcon, CircleCheckBigIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { SettingsRow } from '@/components/settings-row';
import type { SettingsUpdateStatus } from '@/types';

const UPDATE_TOAST_ID = 'flowkey-update';

/**
 * The check-for-updates section shared by the General and About pages.
 * Flow: check → (update found) background download with a top-right progress
 * toast → "Install" button once downloaded, which opens a confirmation dialog
 * — the update never installs without explicit authorization. Phase and
 * progress come from the shell's state pushes.
 */
export function UpdateSection({ status }: { status: SettingsUpdateStatus }) {
  const [installOpen, setInstallOpen] = useState(false);

  // toast on phase transitions
  const lastPhase = useRef(status.phase);
  useEffect(() => {
    const phase = status.phase;
    if (phase === lastPhase.current) {
      return;
    }
    lastPhase.current = phase;
    switch (phase) {
      case 'downloading':
        toast.loading(`Downloading ${status.newVersion ?? 'update'}…`, {
          id: UPDATE_TOAST_ID,
          duration: Infinity,
        });
        break;
      case 'ready':
        toast.success('Update downloaded', {
          id: UPDATE_TOAST_ID,
          description: 'Restart the app from the install button to apply it.',
          duration: 8000,
        });
        break;
      case 'upToDate':
        toast.success("You're up to date", { id: UPDATE_TOAST_ID, duration: 4000 });
        break;
      case 'available':
        toast.info(`Version ${status.newVersion} is available`, {
          id: UPDATE_TOAST_ID,
          description: 'Downloading in the background…',
        });
        break;
      case 'error':
        toast.error('Update failed', {
          id: UPDATE_TOAST_ID,
          description: status.message,
          duration: 8000,
        });
        break;
    }
  }, [status.phase, status.newVersion, status.message]);

  // progress % rides later state pushes; refresh the same toast by id
  useEffect(() => {
    if (status.phase === 'downloading') {
      toast.loading(
        `Downloading ${status.newVersion ?? 'update'}… ${status.progressPercent ?? 0}%`,
        { id: UPDATE_TOAST_ID, duration: Infinity },
      );
    }
  }, [status.phase, status.progressPercent, status.newVersion]);

  const busy = status.phase === 'checking' || status.phase === 'downloading';
  let control: React.ReactNode;
  if (status.phase === 'ready') {
    control = (
      <Button onClick={() => setInstallOpen(true)}>
        <CircleCheckBigIcon />
        Install
      </Button>
    );
  } else if (status.phase === 'downloading') {
    control = (
      <Button disabled>
        <ArrowDownToLineIcon />
        Downloading… {status.progressPercent ?? 0}%
      </Button>
    );
  } else if (status.phase === 'available') {
    control = (
      <Button onClick={() => void invoke('downloadUpdate')}>
        <ArrowDownToLineIcon />
        Download
      </Button>
    );
  } else {
    control = (
      <Button disabled={status.phase === 'checking'} onClick={() => void invoke('checkForUpdates')}>
        <RefreshCwIcon />
        {status.phase === 'checking' ? 'Checking…' : 'Check for Updates'}
      </Button>
    );
  }

  return (
    <div>
      <SettingsRow
        title="Updates"
        description="Check GitHub Releases for a newer version"
        control={control}
      />
      <div className="text-xs text-text-secondary mt-1 mb-1.5 break-words">{status.message}</div>

      <AlertDialog open={installOpen} onOpenChange={setInstallOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Install update {status.newVersion ?? ''} and restart FlowKey?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The app will restart to apply the update. Any running tasks will be interrupted — make
              sure you're ready before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => void invoke('installUpdate')}>Confirm</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
