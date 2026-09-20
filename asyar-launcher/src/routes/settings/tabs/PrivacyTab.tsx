import React, { useEffect } from 'react';
import ClipboardPrivacySection from '../../../components/settings/ClipboardPrivacySection';
import CrashReportSection from '../../../components/settings/CrashReportSection';
import EncryptionStatusSection from '../../../components/settings/EncryptionStatusSection';
import SecretRedactionSection from '../../../components/settings/SecretRedactionSection';
import ShellTrustManager from '../../../components/settings/ShellTrustManager';
import UsageShareSection from '../../../components/settings/UsageShareSection';
import { clipboardPrivacyService } from '../../../services/privacy/clipboardPrivacyService';
import { secretRedactionService } from '../../../services/privacy/secretRedactionService';
import { encryptionService } from '../../../services/privacy/encryptionService';

export default function PrivacyTab() {
  useEffect(() => {
    clipboardPrivacyService.init();
    secretRedactionService.init();
    encryptionService.init();
  }, []);

  return (
    <div className="privacy-tab flex flex-col gap-6">
      <div id="privacy-encryption" className="scroll-mt-6">
        <EncryptionStatusSection />
      </div>

      <div id="privacy-reports" className="scroll-mt-6">
        <CrashReportSection />
      </div>

      <div id="privacy-usage" className="scroll-mt-6">
        <UsageShareSection />
      </div>

      <div id="privacy-clipboard" className="scroll-mt-6">
        <ClipboardPrivacySection />
      </div>

      <div id="privacy-redaction" className="scroll-mt-6">
        <SecretRedactionSection />
      </div>

      <div id="privacy-shell-trust" className="scroll-mt-6">
        <ShellTrustManager />
      </div>
    </div>
  );
}
