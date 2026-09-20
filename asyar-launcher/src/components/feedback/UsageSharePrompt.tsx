import React from 'react';
import { usageSharePromptState } from '../../services/feedback/usageSharePromptState';
import { Button } from '../react/Buttons';

export default function UsageSharePrompt() {
  if (!usageSharePromptState.pendingDay) return null;

  return (
    <div
      className="usage-share-prompt fixed bottom-[calc(var(--space-10)+var(--space-3))] left-[var(--space-5)] right-[var(--space-5)] z-50 rounded-[var(--radius-md)] p-[var(--space-5)] flex flex-col gap-[var(--space-3)] shadow-2xl border border-[color-mix(in_srgb,var(--accent-warning)_60%,transparent)] bg-[color-mix(in_srgb,var(--bg-popup)_97%,transparent)]"
      role="region"
      aria-label="Anonymous usage share"
    >
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold text-[var(--text-primary)]">
          Share anonymous usage?
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          Share anonymous usage for {usageSharePromptState.pendingDay}? Only command counts and your
          anonymous id are sent.
        </span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => usageSharePromptState.confirm()} variant="primary">
          Send
        </Button>
        <Button onClick={() => usageSharePromptState.dismiss()}>Not now</Button>
      </div>
    </div>
  );
}
