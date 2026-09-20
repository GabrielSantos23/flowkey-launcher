import React, { useState } from 'react';
import { crashPromptState } from '../../services/feedback/crashPromptState';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';

export default function CrashReportPrompt() {
  const [showDetails, setShowDetails] = useState(false);

  if (!crashPromptState.visible || !crashPromptState.payload) return null;

  return (
    <div
      className="crash-prompt fixed bottom-[calc(var(--space-10)+var(--space-3))] left-[var(--space-5)] right-[var(--space-5)] z-50 rounded-[var(--radius-md)] p-[var(--space-5)] flex flex-col gap-[var(--space-3)] shadow-2xl border border-[color-mix(in_srgb,var(--accent-warning)_60%,transparent)] bg-[color-mix(in_srgb,var(--bg-popup)_97%,transparent)]"
      role="region"
      aria-label={'Flowkey crashed last time'}
    >
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold text-[var(--text-primary)]">
          {'Flowkey crashed last time'}
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          {'Help us fix it by sending a crash report. Your email is optional.'}
        </span>
      </div>

      <div className="w-full">
        <Input
          value={crashPromptState.email}
          onChange={(e) => {
            crashPromptState.email = e.target.value;
          }}
          type="email"
          placeholder={'Email (optional — leave blank to send anonymously)'}
          disabled={crashPromptState.isSending}
        />
      </div>

      <button
        className="bg-transparent border-0 p-0 cursor-pointer text-sm text-[var(--text-secondary)] text-left underline hover:text-[var(--text-primary)]"
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        aria-expanded={showDetails}
      >
        {showDetails ? 'Hide' : 'View exactly what will be sent'}
      </button>

      {showDetails ? (
        <pre className="font-mono text-xs max-h-32 overflow-y-auto bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] p-3 m-0 whitespace-pre-wrap break-all text-[var(--text-secondary)]">
          {JSON.stringify(crashPromptState.payload, null, 2)}
        </pre>
      ) : null}

      {crashPromptState.sendError ? (
        <p className="text-sm text-[var(--accent-danger)] m-0">{crashPromptState.sendError}</p>
      ) : null}

      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={() => crashPromptState.send()}
          disabled={crashPromptState.isSending}
          variant="primary"
        >
          {crashPromptState.isSending ? 'Sending…' : 'Send'}
        </Button>
        <Button onClick={() => crashPromptState.dismiss()} disabled={crashPromptState.isSending}>
          {'Dismiss'}
        </Button>
      </div>
    </div>
  );
}
