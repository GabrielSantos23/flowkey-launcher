/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockListen = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));

const mockGetIslandState = vi.hoisted(() => vi.fn());
const mockIslandMarkShown = vi.hoisted(() => vi.fn());
vi.mock('../lib/ipc/islandCommands', () => ({
  getIslandState: mockGetIslandState,
  islandMarkShown: mockIslandMarkShown,
  showIsland: vi.fn(),
  hideIsland: vi.fn(),
}));

import IslandPage from './IslandPage';

describe('IslandPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(() => {});
    mockGetIslandState.mockResolvedValue(null);
    mockIslandMarkShown.mockResolvedValue(undefined);
  });

  it('renders nothing when there is no island content', () => {
    render(<IslandPage />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('shows title and subtitle recovered from get_island_state on mount', async () => {
    mockGetIslandState.mockResolvedValue({
      icon: '🖥️',
      title: 'Next Display',
      subtitle: null,
      revealGen: 1,
    });
    render(<IslandPage />);
    expect(await screen.findByText('Next Display')).toBeTruthy();
    expect(screen.queryByText(/Second line/)).toBeNull();
  });

  it('renders icon and subtitle when provided', async () => {
    mockGetIslandState.mockResolvedValue({
      icon: '🎵',
      title: 'Candy Paint',
      subtitle: 'Post Malone',
      revealGen: 2,
    });
    render(<IslandPage />);
    expect(await screen.findByText('Candy Paint')).toBeTruthy();
    expect(screen.getByText('Post Malone')).toBeTruthy();
    expect(screen.getByText('🎵')).toBeTruthy();
  });

  it('updates content when island:show fires and echoes the reveal gen', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    mockListen.mockImplementation((event: string, fn: (e: { payload: unknown }) => void) => {
      handlers.set(event, fn);
      return Promise.resolve(() => {});
    });
    mockGetIslandState.mockResolvedValue(null);
    render(<IslandPage />);
    await waitFor(() => expect(handlers.get('island:show')).toBeTruthy());

    handlers.get('island:show')!({
      payload: { icon: null, title: 'Copied', subtitle: null, waveform: false, revealGen: 7 },
    });

    expect(await screen.findByText('Copied')).toBeTruthy();
    await waitFor(() => expect(mockIslandMarkShown).toHaveBeenCalledWith(7));
  });

  it('clears the pill when island:hide fires (no stale frame on next show)', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    mockListen.mockImplementation((event: string, fn: (e: { payload: unknown }) => void) => {
      handlers.set(event, fn);
      return Promise.resolve(() => {});
    });
    mockGetIslandState.mockResolvedValue(null);
    const { container } = render(<IslandPage />);
    await waitFor(() => expect(handlers.get('island:show')).toBeTruthy());

    handlers.get('island:show')!({
      payload: { icon: null, title: 'Copied', subtitle: null, waveform: false, revealGen: 8 },
    });
    expect(await screen.findByText('Copied')).toBeTruthy();

    handlers.get('island:hide')!({ payload: undefined });
    await waitFor(() => expect(container.querySelector('.island-pill')).toBeNull());
  });

  it('renders an icon URL as album art and shows the waveform when requested', async () => {
    mockGetIslandState.mockResolvedValue({
      icon: 'https://i.scdn.co/image/abc',
      title: 'Candy Paint',
      subtitle: null,
      waveform: true,
      revealGen: 3,
    });
    const { container } = render(<IslandPage />);
    expect(await screen.findByText('Candy Paint')).toBeTruthy();
    expect(container.querySelector('img.island-art')).toBeTruthy();
    expect(container.querySelectorAll('.island-wave i').length).toBe(4);
  });

  it('renders emoji icons as text without a waveform', async () => {
    mockGetIslandState.mockResolvedValue({
      icon: '📄',
      title: 'Copied',
      subtitle: null,
      waveform: false,
      revealGen: 4,
    });
    const { container } = render(<IslandPage />);
    expect(await screen.findByText('📄')).toBeTruthy();
    expect(container.querySelector('img.island-art')).toBeNull();
    expect(container.querySelector('.island-wave')).toBeNull();
  });

  it('renders live score layout with crests and scores', async () => {
    mockGetIslandState.mockResolvedValue({
      icon: 'https://images.fotmob.com/image_resources/logo/teamlogo/8633.png',
      awayIcon: 'https://images.fotmob.com/image_resources/logo/teamlogo/9825.png',
      title: '2',
      subtitle: '1',
      centerText: "45'",
      revealGen: 5,
    });
    const { container } = render(<IslandPage />);
    expect(await screen.findByText("45'")).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    const pill = container.querySelector('.island-pill');
    expect(pill?.classList.contains('score')).toBe(true);
    expect(pill?.classList.contains('goal')).toBe(false);
  });

  it('applies goal class and animation when centerText indicates a goal', async () => {
    mockGetIslandState.mockResolvedValue({
      icon: 'https://images.fotmob.com/image_resources/logo/teamlogo/8633.png',
      awayIcon: 'https://images.fotmob.com/image_resources/logo/teamlogo/9825.png',
      title: '3',
      subtitle: '1',
      centerText: '⚽ GOAL!',
      revealGen: 6,
    });
    const { container } = render(<IslandPage />);
    expect(await screen.findByText('⚽ GOAL!')).toBeTruthy();
    const pill = container.querySelector('.island-pill');
    expect(pill?.classList.contains('score')).toBe(true);
    expect(pill?.classList.contains('goal')).toBe(true);
  });
});
