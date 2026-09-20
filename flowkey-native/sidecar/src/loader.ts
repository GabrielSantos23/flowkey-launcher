import type {
  ExtensionModule,
  ExtensionManifest,
  ReadyExtension,
  HostMessage,
  SidecarMessage,
  InitMessage,
  Preferences,
} from '@flowkey/native-sdk';
import emoji from '@flowkey/extension-emoji';

type LoadedExtension = ExtensionModule & { preferences: Preferences };

const REGISTRY: ExtensionModule[] = [emoji];

export function loadExtensions(): ExtensionModule[] {
  return REGISTRY;
}

export function toReadyExtensions(modules: ExtensionModule[]): ReadyExtension[] {
  return modules.map((m) => ({
    id: m.manifest.id,
    name: m.manifest.name,
    version: m.manifest.version,
    commands: m.manifest.commands,
    nativeMethods: m.manifest.nativeMethods,
    httpHosts: m.manifest.httpHosts,
  }));
}

export function applyInit(modules: ExtensionModule[], init: InitMessage): LoadedExtension[] {
  return modules.map((m) => ({
    ...m,
    preferences: init.preferences[m.manifest.id] ?? {},
  }));
}

export function handleMessage(
  message: HostMessage,
  loaded: LoadedExtension[],
  emit: (message: SidecarMessage) => void,
): void {
  switch (message.type) {
    case 'init':
      break;
    default:
      emit({
        type: 'log',
        level: 'warn',
        message: `unhandled message type ${JSON.stringify(message)}`,
      });
  }
}

export type { LoadedExtension, ExtensionManifest };
