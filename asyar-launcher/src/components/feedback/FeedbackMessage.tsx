import React from 'react';

export interface FeedbackMessageProps {
  message: string;
  interactive?: boolean;
  onclick?: () => void;
}

export default function FeedbackMessage({
  message,
  interactive = false,
  onclick,
}: FeedbackMessageProps) {
  if (interactive) {
    return (
      <button
        type="button"
        className="message-viewport message-trigger border-0 p-0 rounded-[var(--radius-xs)] bg-transparent text-inherit font-inherit text-left cursor-pointer hover:bg-[var(--bg-hover)] truncate flex-1 min-w-0"
        title={message}
        onClick={onclick}
      >
        <span className="truncate">{message}</span>
      </button>
    );
  }

  return (
    <div className="message-viewport truncate flex-1 min-w-0" title={message}>
      <span className="truncate">{message}</span>
    </div>
  );
}
