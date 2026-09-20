import React from 'react';
import { workerRegistry } from '../../services/extension/workerRegistry';
import extensionManager from '../../services/extension/extensionManager';
import { computeBackgroundIframeSet } from './backgroundIframeSet';
import { feedbackService } from '../../services/feedback/feedbackService';

export default function WorkerIframes() {
  const toMount = computeBackgroundIframeSet(
    workerRegistry.entries,
    extensionManager.extensionRecords,
    null,
  );

  const isWindows =
    typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows');

  const handleWorkerError = (extensionId: string) => {
    feedbackService.report({
      source: 'extension',
      kind: 'extension_crash',
      severity: 'error',
      retryable: true,
      context: { extensionId, role: 'worker' },
      extensionId,
    });
  };

  return (
    <>
      {toMount.map((entry) => {
        const src = isWindows
          ? `http://asyar-extension.localhost/${entry.extensionId}/worker.html`
          : `asyar-extension://${entry.extensionId}/worker.html`;

        return (
          <iframe
            key={entry.extensionId}
            data-extension-id={entry.extensionId}
            data-mount-token={String(entry.mountToken)}
            data-role="worker"
            src={src}
            style={{ display: 'none', width: 0, height: 0, border: 0 }}
            sandbox="allow-scripts allow-same-origin"
            title={`Worker: ${entry.extensionId}`}
            onError={() => handleWorkerError(entry.extensionId)}
          />
        );
      })}
    </>
  );
}
