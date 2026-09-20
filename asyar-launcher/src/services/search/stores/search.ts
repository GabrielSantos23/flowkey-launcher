import { Signal } from '../../../lib/reactive';

/**
 * Search-side reactive stores. Every field is a Signal so the launcher's
 * effects re-run when the query, selection, or loading state changes.
 * Plain-property assignment syntax is preserved via accessors.
 */
class SearchStores {
  #query = new Signal('');
  #selectedIndex = new Signal(-1);
  #isLoading = new Signal(false);

  get query(): string {
    return this.#query.get();
  }
  set query(v: string) {
    this.#query.set(v);
  }

  get selectedIndex(): number {
    return this.#selectedIndex.get();
  }
  set selectedIndex(v: number) {
    this.#selectedIndex.set(v);
  }

  get isLoading(): boolean {
    return this.#isLoading.get();
  }
  set isLoading(v: boolean) {
    this.#isLoading.set(v);
  }
}

export const searchStores = new SearchStores();
