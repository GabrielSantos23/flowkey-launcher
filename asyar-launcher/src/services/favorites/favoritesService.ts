import { favoriteToggle, favoritesList } from '../../lib/ipc/commands';
import { logService } from '../log/logService';

/**
 * Frontend cache of the user's favorite pins (search-index object ids).
 * Rust owns the persistence (search_index.db `favorites` table) and the
 * ordering of favorites in merged_search; this service only mirrors the id
 * set so the mapper can tag rows and the ⌘K actions can decide Pin vs Unpin.
 */
class FavoritesService {
  #ids = new Set<string>();

  /** Load the persisted favorite set. Called once during app initialization. */
  async load(): Promise<void> {
    const ids = await favoritesList();
    this.#ids = new Set(ids ?? []);
  }

  isFavorite(objectId: string): boolean {
    return this.#ids.has(objectId);
  }

  /**
   * Toggle the favorite pin for an object id. Updates the local set
   * optimistically and reverts it if the backend call fails. Returns the
   * resulting favorite state (false when the toggle could not be confirmed).
   */
  async toggle(objectId: string): Promise<boolean> {
    const wasFavorite = this.#ids.has(objectId);
    this.setFavorite(objectId, !wasFavorite);

    const result = await favoriteToggle(objectId);
    if (result === null) {
      logService.error(`Failed to toggle favorite for '${objectId}'`);
      this.setFavorite(objectId, wasFavorite);
      return wasFavorite;
    }
    return result.favorited;
  }

  setFavorite(objectId: string, favorited: boolean): void {
    if (favorited) {
      this.#ids.add(objectId);
    } else {
      this.#ids.delete(objectId);
    }
  }
}

export const favoritesService = new FavoritesService();
