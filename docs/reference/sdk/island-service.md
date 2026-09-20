# Island service

`context.getService('island')` shows a notification on the **Dynamic Island** — the transient pill at the top-center of the active monitor. One overlay serves every notification: display switching, now-playing updates, clipboard captures, and extension events.

The island is purely informational: it never takes focus, is not clickable, and auto-hides after `durationMs` (default ~2000ms). Rapid successive calls replace the visible content and restart the timer — never debounce.

## Show

```ts
const island = context.getService<IIslandService>('island');

await island.show({
  icon: '📋',
  title: 'Snippet inserted',
  subtitle: 'Meeting agenda',
  durationMs: 2000,
});
```

| Field        | Type      | Required | Notes                                      |
| ------------ | --------- | -------- | ------------------------------------------ |
| `icon`       | `string`  | no       | Emoji/glyph, or an image URL (rounded art) |
| `title`      | `string`  | yes      | Primary pill text                          |
| `subtitle`   | `string`  | no       | Dimmed secondary line                      |
| `waveform`   | `boolean` | no       | Animated audio-waveform after the title    |
| `pinned`     | `boolean` | no       | Stay visible until `dismiss()`             |
| `durationMs` | `number`  | no       | Auto-hide delay, defaults to ~2000ms       |

## When to use

- Confirmation of an action that happens **outside the launcher window** (display switch, media transport, paste into another app).
- Brief ambient events the user should notice without interrupting work.

## Pinned islands

Pass `pinned: true` when the notification must persist until the condition
ends — recording in progress, a long sync running, a device connected. A
pinned island never auto-hides; call `dismiss()` when it should go away, and
always pair the two (a pinned island left up becomes noise). Any later
non-pinned `show` replaces it and restores normal auto-hide behavior.

```ts
const island = context.getService<IIslandService>('island');
await island.show({ icon: '⏺', title: 'Recording…', pinned: true });
// when the condition ends:
await island.dismiss();
```

## When not to use

- Operation feedback while the launcher is open → `feedback.report()` (Feedback Bar).
- Background or scheduled completion → `feedback.sendBackground()` (OS notification).
- Anything requiring a decision or acknowledgement → `feedback.confirmAlert()`.

## Permissions

`island:show` needs no manifest permission — the island is transient, extension-scoped UI in the same class as toasts and progress. Extensions cannot dismiss the launcher window or reposition the island; those are host-only capabilities.
