import { useEffect, useState } from 'react';
import {
  defineReactExtension,
  Action,
  List,
  type CommandProps,
} from '@flowkey-cli/react-ui';
import type { ExtensionManifest } from '@flowkey-cli/native-sdk';
import manifestJson from '../manifest.json';

interface FetchResult {
  status: number;
  bodyText: string;
}

function ReactDemo(props: CommandProps) {
  const [quote, setQuote] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (props.query.trim().length === 0) {
      setQuote(null);
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const debounce = setTimeout(() => {
      setLoading(true);
      props.native
        .call<FetchResult>(
          'http.fetch',
          { url: 'https://api.github.com/zen', headers: { 'User-Agent': 'flowkey-react-demo' } },
          { signal: controller.signal },
        )
        .then((result) => {
          setQuote(result.bodyText);
          setStatus(result.status);
          setError(null);
        })
        .catch((cause: { code?: string; message?: string }) => {
          if (controller.signal.aborted || cause.code === 'aborted') return;
          setQuote(null);
          setStatus(null);
          setError(`${cause.code ?? 'error'}: ${cause.message ?? String(cause)}`);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [props.query]);

  const items = [];
  if (props.query.trim().length === 0) {
    items.push(
      <List.Item
        key="hint"
        id="hint"
        title="Type to fetch a zen quote"
        subtitle="Debounced, abortable http.fetch from a React component"
        icon="⌨️"
      />,
    );
  } else if (loading) {
    items.push(
      <List.Item key="loading" id="loading" title="Loading…" kind="Status" icon={{ lucide: 'loader' }} />,
    );
  }
  if (error) {
    items.push(
      <List.Item key="error" id="error" title="Fetch failed" subtitle={error} kind="Error" icon="⚠️" />,
    );
  }
  if (quote !== null) {
    items.push(
      <List.Item
        key="quote"
        id="quote"
        title={quote}
        subtitle={`http ${status}`}
        icon="🧘"
        actions={
          <Action
            title="Copy quote"
            primary
            onAction={async () => {
              await props.native.call('clipboard.write', { text: quote });
              setNotice(`Copied at ${new Date().toLocaleTimeString()}`);
            }}
          />
        }
        detail={
          <List.Item.Detail preview={quote}>
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Field label="Source" value="api.github.com/zen" />
              <List.Item.Detail.Metadata.Field label="Status" value={String(status)} />
              <List.Item.Detail.Metadata.Field label="Characters" value={String(quote.length)} />
            </List.Item.Detail.Metadata>
          </List.Item.Detail>
        }
      />,
    );
  }
  items.push(
    <List.Item
      key="clock"
      id="clock"
      title={clock.toLocaleTimeString()}
      subtitle="Live update via uiPush"
      icon="🕒"
    />,
  );
  if (notice) {
    items.push(<List.Item key="notice" id="notice" title={notice} kind="Status" icon="✅" />);
  }

  return <List>{items}</List>;
}

export default defineReactExtension({
  manifest: manifestJson as unknown as ExtensionManifest,
  component: ReactDemo,
});
