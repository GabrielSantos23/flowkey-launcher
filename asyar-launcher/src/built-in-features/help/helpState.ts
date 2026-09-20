import { HELP_TOPICS, filterTopics, type HelpTopic } from './topics';

/** State for the Help view: search query + keyboard selection. */
class HelpViewState {
  query = '';
  selectedIndex = 0;

  get filtered(): HelpTopic[] {
    return filterTopics(HELP_TOPICS, this.query);
  }

  get selected(): HelpTopic | null {
    return this.filtered[this.selectedIndex] ?? null;
  }

  setSearch(query: string): void {
    this.query = query;
    this.selectedIndex = 0;
  }

  move(delta: number): void {
    const len = this.filtered.length;
    if (len === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + len) % len;
  }

  reset(): void {
    this.query = '';
    this.selectedIndex = 0;
  }
}

export const helpViewState = new HelpViewState();
