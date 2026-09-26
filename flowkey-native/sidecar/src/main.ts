import { PROTOCOL_VERSION, type HostMessage, type SidecarMessage } from '@flowkey-cli/native-sdk';
import {
  Dispatcher,
  applyInit,
  loadExtensions,
  loadInstalledExtensions,
  toReadyExtensions,
  type LoadedModule,
} from './loader';
import { installHostGlobals } from './hostGlobals';

installHostGlobals();

const staticModules = loadExtensions();

function emit(message: SidecarMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let dispatcher = new Dispatcher(
  applyInit(staticModules, {
    type: 'init',
    protocolVersion: PROTOCOL_VERSION,
    extensionsDir: '',
    preferences: {},
  }),
  emit,
);

let buffer = '';
let ready = false;
const queuedBeforeReady: HostMessage[] = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line) as HostMessage;
      if (message.type === 'init') {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          emit({
            type: 'log',
            level: 'error',
            message: `protocol version mismatch: host ${message.protocolVersion}, sidecar ${PROTOCOL_VERSION}`,
          });
          process.exit(2);
        }
        void handleInit(message);
        continue;
      }
      if (message.type === 'nativeResult') {
        dispatcher.handleNativeResult(message);
        continue;
      }
      // Installing extensions happens asynchronously during init; messages
      // that arrive before ready would hit the old dispatcher, so hold them.
      if (!ready) {
        queuedBeforeReady.push(message);
        continue;
      }
      void dispatcher.handle(message, emit);
    } catch (error) {
      emit({ type: 'log', level: 'error', message: `bad message: ${String(error)}` });
    }
  }
});

process.stdin.on('end', () => process.exit(0));

async function handleInit(message: Extract<HostMessage, { type: 'init' }>): Promise<void> {
  dispatcher.dispose();
  const disabled = new Set(message.disabledExtensions ?? []);
  const { modules: installed, failures } = await loadInstalledExtensions(message.extensionsDir);
  const modules: LoadedModule[] = [
    ...staticModules,
    ...installed.filter((m) => !disabled.has(m.manifest.id)),
  ];
  dispatcher = new Dispatcher(applyInit(modules, message), emit);
  emit({
    type: 'ready',
    protocolVersion: PROTOCOL_VERSION,
    extensions: toReadyExtensions(modules),
    failures: failures.filter((f) => !disabled.has(f.id)),
  });
  ready = true;
  for (const queued of queuedBeforeReady.splice(0)) {
    void dispatcher.handle(queued, emit);
  }
}
