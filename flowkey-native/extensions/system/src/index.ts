import { defineExtension, type ExtensionModule } from '@flowkey-cli/native-sdk';

type SystemOp =
  | 'lock'
  | 'sleep'
  | 'mute'
  | 'volume-up'
  | 'volume-down'
  | 'empty-recycle-bin'
  | 'restart'
  | 'shutdown';

/** Commands that must be confirmed before the shell runs them. */
const CONFIRMS: Record<string, { title: string; message?: string }> = {
  'empty-trash': {
    title: 'Empty the Recycle Bin?',
    message: 'Everything in it will be permanently deleted.',
  },
  restart: { title: 'Restart this PC?', message: 'All open work will be interrupted.' },
  shutdown: { title: 'Shut down this PC?', message: 'All open work will be interrupted.' },
};

function opFor(commandId: string): SystemOp {
  return commandId === 'empty-trash' ? 'empty-recycle-bin' : (commandId as SystemOp);
}

export default defineExtension({
  manifest: {
    id: 'system',
    name: 'System',
    version: '1.0.0',
    description: 'Lock, sleep, mute, volume and power commands.',
    icon: '⚙️',
    commands: [
      {
        id: 'lock',
        title: 'Lock Screen',
        mode: 'background',
        keywords: ['lock', 'screen', 'secure'],
        icon: 'lock',
      },
      {
        id: 'sleep',
        title: 'Sleep',
        mode: 'background',
        keywords: ['sleep', 'suspend', 'standby'],
        icon: 'moon',
      },
      {
        id: 'mute',
        title: 'Mute',
        mode: 'background',
        keywords: ['mute', 'sound', 'volume'],
        icon: 'volume-x',
      },
      {
        id: 'volume-up',
        title: 'Volume Up',
        mode: 'background',
        keywords: ['volume', 'louder'],
        icon: 'volume-2',
      },
      {
        id: 'volume-down',
        title: 'Volume Down',
        mode: 'background',
        keywords: ['volume', 'quieter'],
        icon: 'volume-1',
      },
      {
        id: 'empty-trash',
        title: 'Empty Recycle Bin',
        mode: 'background',
        keywords: ['trash', 'recycle', 'clean'],
        icon: 'trash-2',
        iconColor: '#EF4444',
      },
      {
        id: 'restart',
        title: 'Restart',
        mode: 'background',
        keywords: ['reboot', 'restart', 'power'],
        icon: 'rotate-cw',
        iconColor: '#EF4444',
      },
      {
        id: 'shutdown',
        title: 'Shut Down',
        mode: 'background',
        keywords: ['shutdown', 'power', 'off'],
        icon: 'power',
        iconColor: '#EF4444',
      },
    ],
    nativeMethods: ['system.control', 'alert.confirm', 'hud.show'],
    httpHosts: [],
  },
  handlers: {
    async command(commandId, ctx) {
      const confirm = CONFIRMS[commandId];
      if (confirm && !(await ctx.capabilities.alert.confirm({ ...confirm, destructive: true }))) {
        return;
      }
      await ctx.capabilities.systemControl.execute(opFor(commandId));
    },
  } as ExtensionModule['handlers'],
});
