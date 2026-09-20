// asyar-launcher/src/lib/ipc/favoriteCommands.ts
// Tauri command wrappers, re-exported through ./commands (the barrel).
import { invokeSafe } from './invokeSafe';
import type { FavoriteToggleResult } from '../../bindings';

// ── Search: User favorites ──────────────────────────────────────────────────

export async function favoriteToggle(objectId: string): Promise<FavoriteToggleResult | null> {
  return invokeSafe<FavoriteToggleResult>('favorite_toggle', { objectId });
}

export async function favoritesList(): Promise<string[] | null> {
  return invokeSafe<string[]>('favorites_list');
}
