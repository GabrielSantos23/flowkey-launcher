import React from 'react';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import { StatusDot } from '../react/Feedback';
import { encryptionService } from '../../services/privacy/encryptionService';

export default function EncryptionStatusSection() {
  const dot =
    encryptionService.current.status === 'active'
      ? { color: 'success' as const, label: 'Active' }
      : encryptionService.current.status === 'fallback'
        ? { color: 'warning' as const, label: 'File-backed (Linux fallback)' }
        : { color: 'info' as const, label: 'Status unavailable' };

  const description =
    encryptionService.current.status === 'active'
      ? 'Active — your master key is stored in the OS keychain. A stolen disk image alone cannot decrypt your data.'
      : encryptionService.current.status === 'fallback'
        ? 'Falling back to a file-backed key because Secret Service was unavailable. Install gnome-keyring or KWallet for full at-rest protection.'
        : 'The launcher is still booting or the host status command failed.';

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Encryption at Rest'}
      </div>
      <SettingsCard>
        <SettingsRow
          label={'Encryption at Rest'}
          description={`Clipboard items, snippet expansions, and encrypted extension preferences are stored as ciphertext on disk. ${description}`}
        >
          <div className="status-row inline-flex items-center gap-2">
            <StatusDot color={dot.color} />
            <span className="text-sm text-[var(--text-primary)]">{dot.label}</span>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
