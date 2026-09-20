import { PROTOCOL_VERSION, type HostMessage, type SidecarMessage } from '@flowkey/native-sdk';
import { applyInit, handleMessage, loadExtensions, toReadyExtensions } from './loader';

const modules = loadExtensions();

function emit(message: SidecarMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let loaded = applyInit(modules, {
  type: 'init',
  protocolVersion: PROTOCOL_VERSION,
  extensionsDir: '',
  preferences: {},
});

let buffer = '';
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
        loaded = applyInit(modules, message);
        emit({
          type: 'ready',
          protocolVersion: PROTOCOL_VERSION,
          extensions: toReadyExtensions(modules),
        });
        continue;
      }
      handleMessage(message, loaded, emit);
    } catch (error) {
      emit({ type: 'log', level: 'error', message: `bad message: ${String(error)}` });
    }
  }
});

process.stdin.on('end', () => process.exit(0));
