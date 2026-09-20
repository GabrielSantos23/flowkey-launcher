// asyar-launcher/src/lib/ipc/systemActionCommands.ts
// Tauri command wrappers, re-exported through ./commands (the barrel).
import { invokeSafe, invokeSafeVoid } from './invokeSafe';
import type { SystemAction } from '../../bindings';

// ── System actions ────────────────────────────────────────────────────────────

/** Generated from Rust's `SystemAction` enum — see `../../bindings`. */
export type SystemActionId = SystemAction;

/** Actions the current machine supports, in display order. */
export async function systemActionsSupported(): Promise<SystemActionId[]> {
  return (await invokeSafe<SystemActionId[]>('system_actions_supported')) ?? [];
}

export async function systemActionRun(action: SystemActionId): Promise<boolean> {
  return invokeSafeVoid('system_action_run', { action });
}
