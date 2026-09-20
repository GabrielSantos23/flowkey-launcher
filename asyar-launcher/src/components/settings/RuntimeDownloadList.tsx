import React from 'react';
import type { RuntimeDownload } from '../../lib/ipc/runtimeCommands';

export interface RuntimeDownloadListProps {
  runtimes: RuntimeDownload[];
}

export default function RuntimeDownloadList({ runtimes }: RuntimeDownloadListProps) {
  if (runtimes.length === 0) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return 'an unknown size';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  return (
    <div className="runtime-downloads flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--separator)]">
      <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
        Downloads
      </span>
      <ul className="flex flex-col gap-1 p-0 m-0 list-none">
        {runtimes.map((runtime) => (
          <li key={runtime.name} className="flex items-baseline gap-2">
            <code className="font-mono text-xs text-[var(--text-primary)]">{runtime.name}</code>
            <span className="text-xs text-[var(--text-secondary)]">
              ({formatBytes(runtime.sizeBytes)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
