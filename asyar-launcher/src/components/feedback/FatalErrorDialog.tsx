import React from 'react';
import ConfirmDialog from '../base/ConfirmDialog';
import { feedbackService } from '../../services/feedback/feedbackService';
import { DIAGNOSTIC_MESSAGES } from '../../services/diagnostics/messages';
import type { DiagnosticKind } from '../../services/diagnostics/kinds';

export default function FatalErrorDialog() {
  const current = feedbackService.current;
  const isOpen = current?.severity === 'fatal';
  const title = 'Flowkey encountered a fatal error';
  const message = (() => {
    if (!current) return '';
    const msgFn = DIAGNOSTIC_MESSAGES[current.kind as DiagnosticKind];
    return msgFn ? msgFn(current.context ?? {}) : (current.developerDetail ?? 'Unknown error');
  })();

  const onClose = () => {
    void feedbackService.dismiss();
  };

  if (!isOpen) return null;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={title}
      message={message}
      variant="danger"
      confirmButtonText={'Restart'}
      cancelButtonText={'Dismiss'}
      oncancel={onClose}
      onconfirm={onClose}
    />
  );
}
