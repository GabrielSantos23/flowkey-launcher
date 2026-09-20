import React, { useEffect, useRef } from 'react';
import { logService as logger } from '../../services/log/logService';
import { extensionIframeManager } from '../../services/extension/extensionIframeManager';
import { viewRegistry } from '../../services/extension/viewRegistry';
import type { ExtensionManifest } from 'asyar-sdk/contracts';
import { collectThemeVariables } from '../../lib/themeVariables';
import { buildFontFaceCSS } from '../../lib/themeFonts';
import { feedbackService } from '../../services/feedback/feedbackService';
import { getExtensionFrameOrigin } from '../../lib/ipc/extensionOrigin';

export interface ExtensionIframeProps {
  extensionId: string;
  manifest: ExtensionManifest | null;
  view?: string | null;
}

export default function ExtensionIframe({
  extensionId,
  manifest,
  view = null,
}: ExtensionIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fontCSSRef = useRef<Promise<string> | null>(null);

  const isWindows =
    typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows');
  const iframeSrc = isWindows
    ? `http://asyar-extension.localhost/${extensionId}/view.html${
        view ? `?view=${view.split('/')[1] || 'DefaultView'}` : ''
      }`
    : `asyar-extension://${extensionId}/view.html${
        view ? `?view=${view.split('/')[1] || 'DefaultView'}` : ''
      }`;

  const sendMessage = (type: string, payload: any) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type, payload },
        getExtensionFrameOrigin(extensionId),
      );
    }
  };

  const handleIframeLoad = async () => {
    sendMessage('asyar:theme:variables', collectThemeVariables(document.documentElement));
    const css = await (fontCSSRef.current ?? buildFontFaceCSS());
    sendMessage('asyar:theme:fonts', css);
  };

  const handleIframeError = () => {
    feedbackService.report({
      source: 'extension',
      kind: 'extension_crash',
      severity: 'error',
      retryable: true,
      context: { extensionId, role: 'view' },
      extensionId,
    });
  };

  useEffect(() => {
    logger.info(`ExtensionIframe mounted for ${extensionId}`);
    fontCSSRef.current = buildFontFaceCSS();

    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const { type, payload } = event.data || {};
      if (type === 'asyar:feedback:uncaught') {
        feedbackService.report({
          source: 'extension',
          kind:
            payload?.kind === 'iframe_unhandled_rejection'
              ? 'iframe_unhandled_rejection'
              : 'iframe_uncaught',
          severity: 'error',
          retryable: false,
          context: { extensionId, role: 'view' },
          extensionId,
          developerDetail: payload?.developerDetail,
        });
        return;
      }
      if (type === 'asyar:extension:input-focus') {
        extensionIframeManager.hasInputFocus = !!payload?.focused;
        return;
      }
      if (type === 'asyar:extension:keydown') {
        const { key, metaKey, ctrlKey, shiftKey, altKey } = payload || {};
        const syntheticEvent = new KeyboardEvent('keydown', {
          key,
          metaKey,
          ctrlKey,
          shiftKey,
          altKey,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(syntheticEvent);
        return;
      }
      logger.debug(`Received message from iframe (${extensionId}): ${type}`);
    };

    window.addEventListener('message', handleMessage);

    const observer = new MutationObserver(() => {
      sendMessage('asyar:theme:variables', collectThemeVariables(document.documentElement));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      window.removeEventListener('message', handleMessage);
      observer.disconnect();
      extensionIframeManager.hasInputFocus = false;
    };
  }, [extensionId]);

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      data-extension-id={extensionId}
      className="w-full h-full border-0 flex-1"
      sandbox="allow-scripts allow-same-origin allow-forms"
      title={`Extension View: ${extensionId}`}
      onLoad={handleIframeLoad}
      onError={handleIframeError}
    />
  );
}
