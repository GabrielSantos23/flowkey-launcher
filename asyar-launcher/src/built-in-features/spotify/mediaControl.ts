import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { logService } from '../../services/log/logService';

export type MediaAction = 'play' | 'pause' | 'toggle' | 'next' | 'previous';

/**
 * Windows-native transport control: talks to the local Spotify session via
 * the System Media Transport Controls (SMTC) — no network round-trip, so
 * play/pause/skip are instant. Returns false when unavailable (non-Windows,
 * PowerShell failure, Spotify not running) so callers can fall back to the
 * Web API.
 */
export async function smtcCommand(action: MediaAction): Promise<boolean> {
  if ((await platform()) !== 'windows') return false;
  try {
    await invoke('spotify_smtc_command', { action });
    return true;
  } catch (err) {
    logService.warn(`[Spotify] native media control failed, falling back to API: ${err}`);
    return false;
  }
}
