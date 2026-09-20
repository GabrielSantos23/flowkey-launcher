import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/react/Buttons';
import { Icon } from '../../../components/react/Icon';
import { EmptyState } from '../../../components/react/Feedback';
import SettingsCard from '../../../components/settings/SettingsCard';
import {
  scriptsListDirectories,
  scriptsPickDirectory,
  scriptsAddDirectory,
  scriptsRemoveDirectory,
} from '../../../lib/ipc/commands';
import { logService } from '../../../services/log/logService';

export default function ScriptsTab() {
  const [directories, setDirectories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDirectories = async () => {
    try {
      const dirs = (await scriptsListDirectories()) ?? [];
      setDirectories(dirs);
    } catch (err) {
      logService.warn(`Failed to list script directories: ${err}`);
    }
  };

  useEffect(() => {
    fetchDirectories().finally(() => {
      setIsLoading(false);
    });
  }, []);

  const handleAddDirectory = async () => {
    if (isBrowsing) return;
    setIsBrowsing(true);
    setErrorMessage(null);
    try {
      const picked = await scriptsPickDirectory();
      if (!picked) return;

      if (directories.includes(picked)) {
        setErrorMessage(`${picked} is already in the list`);
        return;
      }

      await scriptsAddDirectory(picked);
      await fetchDirectories();
    } catch (err) {
      logService.warn(`Script directory picker failed: ${err}`);
      setErrorMessage('Could not add directory');
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleRemoveDirectory = async (path: string) => {
    try {
      await scriptsRemoveDirectory(path);
      await fetchDirectories();
    } catch (err) {
      logService.warn(`Failed to remove script directory: ${err}`);
      setErrorMessage('Could not remove directory');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Script directories'}
      </div>
      <div id="scripts-directories">
        <p className="m-0 mb-3 text-xs text-[var(--text-secondary)] leading-relaxed">
          {
            'Directories added here will be watched for executable scripts. Scripts are discovered automatically — no restart required.'
          }
        </p>

        <div className="mb-3 self-start">
          <Button onClick={() => void handleAddDirectory()} disabled={isBrowsing}>
            <span className="inline-flex items-center gap-2">
              <Icon name="plus" size={14} />
              {isBrowsing ? 'Opening…' : 'Add directory…'}
            </span>
          </Button>
        </div>

        {errorMessage ? (
          <div
            className="mb-3 p-2 bg-[color-mix(in_srgb,var(--accent-danger)_10%,transparent)] rounded-[var(--radius-sm)] text-xs text-[var(--accent-danger)]"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-4 text-center text-[var(--text-tertiary)] text-sm">{'Loading...'}</div>
        ) : directories.length === 0 ? (
          <EmptyState message={'No script directories added yet'} />
        ) : (
          <SettingsCard>
            <ul className="list-none p-0 m-0 flex flex-col">
              {directories.map((path) => (
                <li
                  key={path}
                  className="flex items-center gap-2 p-4 border-b border-[var(--border-color)] last:border-b-0"
                >
                  <Icon
                    name="dev-tools"
                    size={14}
                    className="text-[var(--text-tertiary)] shrink-0"
                  />
                  <span
                    className="flex-1 min-w-0 text-sm text-[var(--text-primary)] truncate"
                    title={path}
                  >
                    {path}
                  </span>
                  <button
                    type="button"
                    className="p-1 text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer hover:opacity-80"
                    aria-label={`Remove ${path}`}
                    onClick={() => void handleRemoveDirectory(path)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </SettingsCard>
        )}
      </div>
    </div>
  );
}
