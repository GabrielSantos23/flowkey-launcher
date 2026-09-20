import type {
  ExtensionContext,
  Extension,
  IExtensionManager,
  ILogService,
} from 'asyar-sdk/contracts';
import { ActionContext } from 'asyar-sdk/contracts';
import { listen } from '@tauri-apps/api/event';
import { actionService } from '../../services/action/actionService';
import { viewManager } from '../../services/extension/viewManager';
import { feedbackService } from '../../services/feedback/feedbackService';
import { islandService } from '../../services/island/islandService';
import { bridgeListen } from '../../lib/ipc/bridgeEvents';
import { logService } from '../../services/log/logService';
import { spotifyAuth } from './spotifyAuth';
import { smtcCommand } from './mediaControl';
import * as api from './spotifyApi';
import { spotifyState } from './state';
import DefaultView from './DefaultView';
import SearchView from './SearchView';
import LibraryView from './LibraryView';
import QueueView from './QueueView';
import DevicesView from './DevicesView';
import LyricsView from './LyricsView';

export { DefaultView, SearchView, LibraryView, QueueView, DevicesView, LyricsView };

const EXTENSION_ID = 'spotify';
const ACTION_PREFIX = 'app.asyar.spotify';

const VIEW_ROUTES: Record<string, string> = {
  'now-playing': 'spotify/DefaultView',
  search: 'spotify/SearchView',
  library: 'spotify/LibraryView',
  queue: 'spotify/QueueView',
  devices: 'spotify/DevicesView',
  lyrics: 'spotify/LyricsView',
};

/** Launcher-wide quick commands, surfaced as ⌘K actions. */
const QUICK_COMMANDS: { id: string; title: string; description: string; icon: string }[] = [
  {
    id: 'toggle-play-pause',
    title: 'Spotify: Play/Pause',
    description: 'Toggle play/pause on the active device',
    icon: 'icon:activity',
  },
  {
    id: 'next-track',
    title: 'Spotify: Next Track',
    description: 'Skip to the next track',
    icon: 'icon:activity',
  },
  {
    id: 'previous-track',
    title: 'Spotify: Previous Track',
    description: 'Back to the previous track',
    icon: 'icon:activity',
  },
  {
    id: 'toggle-shuffle',
    title: 'Spotify: Toggle Shuffle',
    description: 'Toggle shuffle on the active device',
    icon: 'icon:refresh',
  },
  {
    id: 'cycle-repeat',
    title: 'Spotify: Cycle Repeat',
    description: 'Cycle repeat mode: off → context → track',
    icon: 'icon:refresh',
  },
  {
    id: 'copy-track-url',
    title: 'Spotify: Copy Track URL',
    description: 'Copy the open.spotify.com link of the current track',
    icon: 'icon:copy',
  },
];

/**
 * Native Spotify player. Talks to the Spotify Web API with a PKCE token
 * managed through the host's OAuth machinery. Playback control requires a
 * Spotify Premium account (Spotify API limitation).
 */
class SpotifyExtension implements Extension {
  private extensionManager?: IExtensionManager;

  async initialize(context: ExtensionContext): Promise<void> {
    this.extensionManager = context.getService<IExtensionManager>('extensions');

    const clientId = context.preferences?.values?.clientId;
    spotifyAuth.setClientId(
      typeof clientId === 'string' && clientId.trim() ? clientId.trim() : null,
    );

    await spotifyAuth.hydrate();
    this.registerQuickCommandActions();

    // "Now playing" island: the Rust SMTC watcher (Windows) emits a
    // track-changed event for every track transition — including ones started
    // inside Spotify itself — and this is the only consumer.
    void bridgeListen<{ title: string; artist: string; art?: string }>(
      'media:track-changed',
      ({ payload }) => {
        void this.showTrackIsland(payload.title, payload.artist, payload.art);
      },
    );
    // Keep the Client ID in sync with Settings edits without an app restart.
    void listen('asyar:preferences-changed', () => {
      void spotifyAuth.refreshClientId();
    });
    logService.info(
      `[Spotify] initialized (client id ${spotifyAuth.hasClientId() ? 'configured' : 'missing'}, ` +
        `${spotifyAuth.isAuthenticated() ? 'authorized' : 'not authorized'})`,
    );
  }

  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}

  /** Quick commands are ActionService contributions (⌘K panel), not worker commands. */
  private registerQuickCommandActions(): void {
    for (const cmd of QUICK_COMMANDS) {
      const actionId = `${ACTION_PREFIX}:${cmd.id}`;
      if (actionService.getAllActions().some((a) => a.id === actionId)) continue;
      actionService.registerAction({
        id: actionId,
        title: cmd.title,
        description: cmd.description,
        icon: cmd.icon,
        extensionId: EXTENSION_ID,
        context: ActionContext.GLOBAL,
        execute: () => this.runQuickCommand(cmd.id),
      });
    }
  }

  async executeCommand(commandId: string, _args?: Record<string, any>): Promise<unknown> {
    const route = VIEW_ROUTES[commandId];
    if (route) {
      // Re-invoking Now Playing while its view is open toggles play/pause —
      // the ⏎ primary action in the bottom bar acts as Play/Pause.
      if (commandId === 'now-playing' && viewManager.activeView === route) {
        await this.runQuickCommand('toggle-play-pause');
        return { type: 'no-view' };
      }
      this.extensionManager?.navigateToView(route);
      return { type: 'view', viewPath: route };
    }
    if (QUICK_COMMANDS.some((q) => q.id === commandId)) {
      await this.runQuickCommand(commandId);
      return { type: 'no-view' };
    }
    throw new Error(`Unknown Spotify command: ${commandId}`);
  }

  /** One-shot playback commands — native SMTC first, Web API as fallback. */
  private async runQuickCommand(commandId: string): Promise<void> {
    try {
      // 1. Native SMTC first (instant, works with local Spotify app without OAuth or Premium)
      switch (commandId) {
        case 'toggle-play-pause':
          if (await smtcCommand('toggle')) {
            this.feedbackInfo('Toggled playback.');
            await islandService.show({ icon: '⏯', title: 'Toggled playback' });
            return;
          }
          break;
        case 'next-track':
          if (await smtcCommand('next')) {
            this.feedbackInfo('Skipped to the next track.');
            await islandService.show({ icon: '⏭', title: 'Next track' });
            return;
          }
          break;
        case 'previous-track':
          if (await smtcCommand('previous')) {
            this.feedbackInfo('Back to the previous track.');
            await islandService.show({ icon: '⏮', title: 'Previous track' });
            return;
          }
          break;
      }

      // 2. Web API fallback (or commands requiring Web API like shuffle, repeat, copy-url)
      const token = await spotifyAuth.getValidToken();
      if (!token) {
        this.reportNotConnected();
        return;
      }

      switch (commandId) {
        case 'toggle-play-pause':
          await this.togglePlayPause(token);
          break;
        case 'next-track':
          await api.nextTrack(token);
          await this.showTrackIsland();
          break;
        case 'previous-track':
          await api.previousTrack(token);
          await this.showTrackIsland();
          break;
        case 'toggle-shuffle': {
          const state = await api.getPlaybackState(token);
          await api.toggleShuffle(token, !(state?.shuffle_state ?? false));
          this.feedbackInfo(`Shuffle ${state?.shuffle_state ? 'off' : 'on'}.`);
          break;
        }
        case 'cycle-repeat': {
          const state = await api.getPlaybackState(token);
          const order = ['off', 'context', 'track'] as const;
          const current = state?.repeat_state ?? 'off';
          const next = order[(order.indexOf(current) + 1) % order.length];
          await api.setRepeat(token, next);
          this.feedbackInfo(`Repeat: ${next}.`);
          break;
        }
        case 'copy-track-url': {
          const track = await this.fetchCurrentTrack(token);
          if (!track?.id) {
            this.feedbackInfo('Nothing is playing right now.');
            return;
          }
          const { writeText } = await import('tauri-plugin-clipboard-x-api');
          await writeText(`https://open.spotify.com/track/${track.id}`);
          this.feedbackInfo('Track URL copied.');
          break;
        }
        default:
          logService.error(`[Spotify] unknown quick command: ${commandId}`);
      }
    } catch (err) {
      logService.error(`[Spotify] ${commandId} failed: ${err}`);
      const is403 = err instanceof api.SpotifyApiError && err.status === 403;
      const message = is403
        ? 'Spotify blocked this action: apps in Development Mode cannot write your library. Request Extended Quota Mode in the Spotify dashboard (or use Spotify itself for saving tracks).'
        : `Spotify: ${err instanceof Error ? err.message : String(err)}`;
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message },
      });
    }
  }

  private async togglePlayPause(token: string): Promise<void> {
    const state = await api.getPlaybackState(token);
    if (state?.is_playing) {
      await api.pause(token, state.device?.id ?? undefined);
      this.feedbackInfo('Paused.');
      await islandService.show({ icon: '⏸', title: 'Paused' });
    } else {
      await api.play(token, { deviceId: state?.device?.id ?? undefined });
      this.feedbackInfo('Playing.');
      await this.showTrackIsland();
    }
  }

  /**
   * Island notification for the track that is playing right now, with album
   * art when the Spotify API can supply it. The SMTC watcher only carries
   * title/artist, so art requires a Web API round-trip; the fetched track is
   * matched against the expected title to avoid showing stale art for a
   * track that was skipped again mid-fetch.
   */
  private async showTrackIsland(
    expectedTitle?: string,
    fallbackArtist?: string,
    nativeArt?: string,
  ): Promise<void> {
    // The Windows SMTC watcher embeds the album thumbnail natively — use it
    // directly and skip the Web API round-trip entirely.
    if (nativeArt) {
      await islandService.show({
        icon: nativeArt,
        title: expectedTitle ?? 'Playing',
        subtitle: fallbackArtist || undefined,
        waveform: true,
      });
      return;
    }

    const token = await spotifyAuth.getValidToken().catch(() => null);
    let art: string | undefined;
    let title = expectedTitle;
    let artist = fallbackArtist;

    if (token) {
      try {
        const state = await api.getPlaybackState(token);
        spotifyState.setPlayback(state);
        const track = state?.item ?? null;
        if (track && (!expectedTitle || track.name === expectedTitle)) {
          art = track.album?.images?.find((img) => (img.width ?? 0) >= 128)?.url;
          title = track.name;
          artist = track.artists?.map((a) => a.name).join(', ') || artist;
        }
      } catch {
        // Art is optional — fall back to the glyph.
      }
    }

    await islandService.show({
      icon: art ?? '🎵',
      title: title ?? 'Playing',
      subtitle: artist || undefined,
      waveform: true,
    });
  }

  private async fetchCurrentTrack(token: string) {
    const state = await api.getPlaybackState(token);
    spotifyState.setPlayback(state);
    return state?.item ?? null;
  }

  private feedbackInfo(message: string): void {
    feedbackService.report({
      source: 'frontend',
      kind: 'manual',
      severity: 'info',
      retryable: false,
      context: { message },
    });
  }

  private reportNotConnected(): void {
    logService.warn('[Spotify] not connected — open Spotify: Now Playing to set it up.');
    feedbackService.report({
      source: 'frontend',
      kind: 'manual',
      severity: 'warning',
      retryable: false,
      context: {
        message: 'Spotify is not connected — open Spotify: Now Playing to set it up.',
      },
    });
    void islandService.show({
      icon: '⚠️',
      title: 'Spotify not connected',
      subtitle: 'Open Spotify: Now Playing to set it up',
    });
  }
}

export const spotifyExtension = new SpotifyExtension();
export default spotifyExtension;
