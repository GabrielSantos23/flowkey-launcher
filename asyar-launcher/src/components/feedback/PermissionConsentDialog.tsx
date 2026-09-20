import React from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import PermissionList from '../settings/PermissionList';
import RuntimeDownloadList from '../settings/RuntimeDownloadList';
import type { PermissionConsentRequest } from '../../services/extension/permissionConsentService';

export interface PermissionConsentDialogProps {
  request: PermissionConsentRequest;
  onAccept: () => void;
  onDecline: () => void;
}

export default function PermissionConsentDialog({
  request,
  onAccept,
  onDecline,
}: PermissionConsentDialogProps) {
  const subtitle = (() => {
    switch (request.reason) {
      case 'install':
        return 'Installing it grants the following permissions:';
      case 'enable':
        return 'Enabling it grants the following permissions:';
      case 'update':
        return 'An update changed the permissions it requests:';
      case 'review':
        return 'Its requested permissions have changed and need your review:';
    }
  })();

  return (
    <Modal
      isOpen={true}
      labelledBy="permission-consent-title"
      onEscape={onDecline}
      onEnter={onAccept}
      actions={
        <>
          <Button onClick={onDecline}>{'Cancel'}</Button>
          <Button
            autoFocus
            onClick={onAccept}
            className="!bg-[var(--accent-primary-fill)] !text-[var(--text-on-accent)] !border-none hover:opacity-90"
          >
            {'Allow'}
          </Button>
        </>
      }
    >
      <h2
        id="permission-consent-title"
        className="text-xl font-semibold mb-2 text-[var(--text-primary)]"
      >
        {request.extensionName} requests permissions
      </h2>
      <p className="text-[var(--text-secondary)] text-sm mb-4">{subtitle}</p>

      <div className="max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        <PermissionList permissions={request.permissions} permissionArgs={request.permissionArgs} />
        <RuntimeDownloadList runtimes={request.runtimeDownloads ?? []} />
      </div>
    </Modal>
  );
}
