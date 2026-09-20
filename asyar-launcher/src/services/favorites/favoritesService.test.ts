import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFavoriteToggle = vi.hoisted(() => vi.fn());
const mockFavoritesList = vi.hoisted(() => vi.fn());

vi.mock('../../lib/ipc/commands', () => ({
  favoriteToggle: mockFavoriteToggle,
  favoritesList: mockFavoritesList,
}));

vi.mock('../log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { favoritesService } from './favoritesService';

describe('favoritesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('populates the favorite set from the backend list', async () => {
      mockFavoritesList.mockResolvedValueOnce(['app_safari', 'cmd_org.foo_bar']);
      await favoritesService.load();
      expect(favoritesService.isFavorite('app_safari')).toBe(true);
      expect(favoritesService.isFavorite('cmd_org.foo_bar')).toBe(true);
      expect(favoritesService.isFavorite('app_notes')).toBe(false);
    });

    it('starts empty when the backend returns null', async () => {
      mockFavoritesList.mockResolvedValueOnce(null);
      await favoritesService.load();
      expect(favoritesService.isFavorite('app_safari')).toBe(false);
    });
  });

  describe('toggle', () => {
    it('returns true and marks the item favorited when the backend confirms the pin', async () => {
      mockFavoriteToggle.mockResolvedValueOnce({ favorited: true });
      const result = await favoritesService.toggle('app_safari');
      expect(result).toBe(true);
      expect(favoritesService.isFavorite('app_safari')).toBe(true);
      expect(mockFavoriteToggle).toHaveBeenCalledWith('app_safari');
    });

    it('returns false and clears the item when the backend confirms the unpin', async () => {
      mockFavoritesList.mockResolvedValueOnce(['app_safari']);
      await favoritesService.load();
      mockFavoriteToggle.mockResolvedValueOnce({ favorited: false });
      const result = await favoritesService.toggle('app_safari');
      expect(result).toBe(false);
      expect(favoritesService.isFavorite('app_safari')).toBe(false);
    });

    it('reverts the optimistic local update when the backend call fails', async () => {
      mockFavoriteToggle.mockResolvedValueOnce(null); // invokeSafe failure marker
      const result = await favoritesService.toggle('app_safari');
      expect(result).toBe(false);
      expect(favoritesService.isFavorite('app_safari')).toBe(false);
    });

    it('reverts an optimistic unpin when the backend call fails', async () => {
      mockFavoritesList.mockResolvedValueOnce(['app_safari']);
      await favoritesService.load();
      mockFavoriteToggle.mockResolvedValueOnce(null);
      const result = await favoritesService.toggle('app_safari');
      expect(result).toBe(true);
      expect(favoritesService.isFavorite('app_safari')).toBe(true);
    });
  });
});
