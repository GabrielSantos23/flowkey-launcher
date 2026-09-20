import React from 'react';
import { feedbackService } from '../../services/feedback/feedbackService';
import { permissionConsentService } from '../../services/extension/permissionConsentService';
import ConfirmDialog from '../base/ConfirmDialog';
import PermissionConsentDialog from './PermissionConsentDialog';

export default function DialogHost() {
  const activeRequest = permissionConsentService.activeRequest;
  const activeDialog = feedbackService.activeDialog;

  return (
    <>
      {activeRequest ? (
        <PermissionConsentDialog
          request={activeRequest}
          onAccept={() => permissionConsentService.onAccepted()}
          onDecline={() => permissionConsentService.onDeclined()}
        />
      ) : null}

      {activeDialog ? (
        <ConfirmDialog
          isOpen={true}
          title={activeDialog.title}
          message={activeDialog.message}
          confirmButtonText={activeDialog.confirmText ?? 'Confirm'}
          cancelButtonText={activeDialog.cancelText ?? 'Cancel'}
          variant={activeDialog.variant ?? 'default'}
          onconfirm={() => feedbackService.onDialogConfirmed()}
          oncancel={() => feedbackService.onDialogCancelled()}
        />
      ) : null}
    </>
  );
}
