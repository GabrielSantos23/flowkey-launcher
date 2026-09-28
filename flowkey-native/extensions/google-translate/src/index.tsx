import { createElement, type ReactNode } from 'react';
import { defineReactExtension, List, type CommandProps } from '@flowkey-cli/react-ui';
import manifest from '../manifest.json';

/**
 * All three commands declare `ui: "web"`, so the sidecar never renders this
 * module (see `isWebOnlyModule`) — the translation surface lives in
 * `src/index.web.tsx` and runs in the shell's WebView2. This entry stays as the
 * bundle's main entry point and the sidecar's registry import.
 */
function WebOnlyNotice(props: CommandProps): ReactNode {
  return createElement(
    List,
    null,
    createElement(List.EmptyView, {
      title: 'This command renders in the web view',
      description:
        props.commandId === undefined
          ? 'Open the Translate, Quick Translate or Translate Clipboard command.'
          : `The '${props.commandId}' command renders in the web view.`,
    }),
  );
}

export default defineReactExtension({
  manifest: manifest as unknown as import('@flowkey-cli/native-sdk').ExtensionManifest,
  component: WebOnlyNotice,
});
