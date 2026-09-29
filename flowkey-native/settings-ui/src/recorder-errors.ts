/**
 * Recorder error pub/sub: the HotkeyRecorder overlay publishes the shell's
 * rejection for the active capture session, and rows (Shortcuts page, detail
 * command rows) subscribe to show the reason inline next to their cell.
 * A null error means the session ended cleanly.
 */

type Listener = (commandKey: string | null, error: string | null) => void;

const listeners = new Set<Listener>();

let activeCommandKey: string | null = null;
let activeError: string | null = null;

export function publishRecorderError(commandKey: string | null, error: string | null): void {
  activeCommandKey = commandKey;
  activeError = error;
  listeners.forEach((listener) => listener(commandKey, error));
}

export function subscribeRecorderErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current error for a command row, if its session is the active one. */
export function currentRecorderError(commandKey: string): string | null {
  return activeCommandKey === commandKey ? activeError : null;
}
