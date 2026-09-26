import { useEffect, useState, type ReactNode } from 'react';
import type { CommandProps } from '@flowkey-cli/react-ui';
import { Action, ActionPanel, List } from '@flowkey-cli/react-ui';
import type { NativeCallFn } from './api/client';
import { AUTO_DETECT, languagePairLabel, readTranslatePreferences } from './preferences';
import {
  TranslationResultItems,
  emptyTextFailureTitle,
  failureTitle,
  useCopyAction,
  useDebouncedTranslation,
  type TranslationState,
} from './translation-ui';

interface ClipboardText {
  state: 'loading' | 'ready' | 'error';
  text: string;
}

function useClipboardText(call: NativeCallFn): ClipboardText {
  const [state, setState] = useState<ClipboardText>({ state: 'loading', text: '' });
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const result = await call<{ text?: string }>('clipboard.read');
        if (!alive) return;
        setState({ state: 'ready', text: typeof result.text === 'string' ? result.text : '' });
      } catch {
        if (alive) setState({ state: 'error', text: '' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [call]);
  return state;
}

/**
 * "Translate Clipboard" — the pragmatic stand-in for Raycast's instant-translate:
 * it reads the latest clipboard text and translates it as the initial input.
 * Typing in the search box replaces the text.
 */
export function TranslateClipboardCommand({ query, preferences, native }: CommandProps): ReactNode {
  const prefs = readTranslatePreferences(preferences);
  const clipboard = useClipboardText(native.call);
  const copy = useCopyAction(native.call);

  const text = query.trim() ? query : clipboard.text;
  const usingClipboard = !query.trim() && clipboard.text.length > 0;
  const state: TranslationState = useDebouncedTranslation(
    native.call,
    text,
    prefs.langFrom,
    prefs.lang1,
    clipboard.state === 'loading',
  );

  if (clipboard.state === 'error') {
    return (
      <List>
        <List.EmptyView
          title="Could not read the clipboard"
          description="FlowKey could not access the current clipboard text. Copy the text again, or just type it."
        />
      </List>
    );
  }

  if (!text.trim() && clipboard.state !== 'loading') {
    return (
      <List>
        <List.EmptyView
          title="Clipboard is empty"
          description="Copy some text anywhere, then reopen this command — or type the text to translate."
        />
      </List>
    );
  }

  if (clipboard.state === 'loading' || state.loading) {
    return (
      <List>
        <List.EmptyView title={usingClipboard ? 'Translating clipboard text…' : 'Translating…'} />
      </List>
    );
  }

  if (state.failure) {
    return (
      <List>
        <List.EmptyView title={failureTitle(state.failure)} description={state.failure.message} />
      </List>
    );
  }

  const result = state.result;
  if (!result || result.translatedText.length === 0) {
    return (
      <List>
        <List.EmptyView
          title={emptyTextFailureTitle()}
          description="Google returned a valid response with no translation for this text."
        />
      </List>
    );
  }

  return (
    <List>
      {usingClipboard ? (
        <List.Section title="From Clipboard">
          <List.Item
            id="clipboard-source"
            title={result.originalText}
            icon={{ lucide: 'clipboard' }}
            actions={
              <ActionPanel>
                <Action title="Copy Original Text" onAction={() => copy(result.originalText, 'Copy Original Text')} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      <TranslationResultItems
        result={result}
        from={prefs.langFrom}
        to={prefs.lang1}
        onCopy={copy}
      />
    </List>
  );
}
