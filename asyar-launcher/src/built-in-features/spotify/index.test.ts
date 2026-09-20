import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSmtcCommand = vi.hoisted(() => vi.fn());

const apiMocks = vi.hoisted(() => ({
  getPlaybackState: vi.fn().mockResolvedValue(null),
  nextTrack: vi.fn().mockResolvedValue(undefined),
  previousTrack: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
  likeTracks: vi.fn().mockResolvedValue(undefined),
  checkSavedTracks: vi.fn().mockResolvedValue([false]),
  getRecommendations: vi.fn().mockResolvedValue({ tracks: [] }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('@tauri-apps/plugin-os', () => ({
  platform: vi.fn().mockResolvedValue('windows'),
}));
vi.mock('./mediaControl', () => ({
  smtcCommand: mockSmtcCommand,
}));
vi.mock('./spotifyAuth', () => ({
  spotifyAuth: {
    setClientId: vi.fn(),
    hasClientId: vi.fn(() => true),
    hydrate: vi.fn().mockResolvedValue(undefined),
    getValidToken: vi.fn().mockResolvedValue('tok-123'),
    isAuthenticated: vi.fn(() => true),
    authorize: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshClientId: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('./spotifyApi', () => ({
  SpotifyApiError: class extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  ...apiMocks,
}));
vi.mock('./DefaultView', () => ({ default: () => null }));
vi.mock('./SearchView', () => ({ default: () => null }));
vi.mock('./LibraryView', () => ({ default: () => null }));
vi.mock('./QueueView', () => ({ default: () => null }));
vi.mock('./DevicesView', () => ({ default: () => null }));
vi.mock('./LyricsView', () => ({ default: () => null }));
vi.mock('../../services/action/actionService', () => ({
  actionService: {
    registerAction: vi.fn(),
    unregisterAction: vi.fn(),
    getAllActions: vi.fn(() => []),
    executeAction: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../services/extension/viewManager', () => ({
  viewManager: { activeView: null, getNavigationStackSize: vi.fn(() => 0), goBack: vi.fn() },
}));
vi.mock('../../services/feedback/feedbackService', () => ({
  feedbackService: { report: vi.fn(), dismiss: vi.fn(), current: null, confirmAlert: vi.fn() },
}));
vi.mock('../../services/log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { spotifyExtension } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  mockSmtcCommand.mockResolvedValue(true);
});

describe('native transport (SMTC)', () => {
  it('routes next-track through SMTC without touching the Web API', async () => {
    await spotifyExtension.executeCommand('next-track');

    expect(mockSmtcCommand).toHaveBeenCalledWith('next');
    expect(apiMocks.nextTrack).not.toHaveBeenCalled();
  });

  it('routes previous-track through SMTC', async () => {
    await spotifyExtension.executeCommand('previous-track');

    expect(mockSmtcCommand).toHaveBeenCalledWith('previous');
    expect(apiMocks.previousTrack).not.toHaveBeenCalled();
  });

  it('routes toggle-play-pause through SMTC toggle', async () => {
    await spotifyExtension.executeCommand('toggle-play-pause');

    expect(mockSmtcCommand).toHaveBeenCalledWith('toggle');
    expect(apiMocks.play).not.toHaveBeenCalled();
    expect(apiMocks.pause).not.toHaveBeenCalled();
  });

  it('falls back to the Web API when SMTC is unavailable', async () => {
    mockSmtcCommand.mockResolvedValue(false);

    await spotifyExtension.executeCommand('next-track');

    expect(apiMocks.nextTrack).toHaveBeenCalledWith('tok-123');
  });

  it('routes next-track, previous-track and toggle-play-pause through SMTC even without a Web API token', async () => {
    const { spotifyAuth } = await import('./spotifyAuth');
    vi.mocked(spotifyAuth.getValidToken).mockResolvedValueOnce(null);

    await spotifyExtension.executeCommand('next-track');
    expect(mockSmtcCommand).toHaveBeenCalledWith('next');

    vi.mocked(spotifyAuth.getValidToken).mockResolvedValueOnce(null);
    await spotifyExtension.executeCommand('previous-track');
    expect(mockSmtcCommand).toHaveBeenCalledWith('previous');

    vi.mocked(spotifyAuth.getValidToken).mockResolvedValueOnce(null);
    await spotifyExtension.executeCommand('toggle-play-pause');
    expect(mockSmtcCommand).toHaveBeenCalledWith('toggle');
  });
});
