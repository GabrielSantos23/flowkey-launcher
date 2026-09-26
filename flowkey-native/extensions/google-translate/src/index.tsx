import { createElement, type ReactNode } from 'react';
import { defineReactExtension, List, type CommandProps } from '@flowkey-cli/react-ui';
import manifest from '../manifest.json';
import { TranslateClipboardCommand } from './translate-clipboard';
import { TranslateCommand } from './translate';
import { QuickTranslateCommand } from './quick-translate';

export default defineReactExtension({
  manifest: manifest as unknown as import('@flowkey-cli/native-sdk').ExtensionManifest,
  component: (props: CommandProps) => {
    const commandId = props.commandId ?? 'translate';
    if (commandId === 'quick-translate') {
      return createElement(QuickTranslateCommand, props);
    }
    if (commandId === 'translate-clipboard') {
      return createElement(TranslateClipboardCommand, props);
    }
    if (commandId === 'translate') {
      return createElement(TranslateCommand, props);
    }
    return createElement(
      List,
      null,
      createElement(List.EmptyView, {
        title: 'Command not available yet',
        description: `The '${commandId}' command lands in a later slice.`,
      }),
    );
  },
});
