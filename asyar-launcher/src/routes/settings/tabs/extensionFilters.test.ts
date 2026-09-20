import { describe, it, expect } from 'vitest';
import { filterExtensions } from './extensionFilters';
import type { ExtensionItem } from '../settingsHandlers';

function makeExt(
  title: string,
  type: string,
  commands: { id: string; name: string; trigger: string }[] = [],
  isBuiltIn = false,
): ExtensionItem {
  return {
    title,
    type,
    isBuiltIn,
    commands: commands.map((c) => ({ ...c, description: '' })),
  };
}
// After the Tier 2 worker/view split there are only two extension types:
// "extension" (everything with commands) and "theme". The per-command
// view/background distinction is filtered elsewhere.
const extensions: ExtensionItem[] = [
  makeExt('Catppuccin', 'theme'),
  makeExt('Pomodoro Timer', 'extension', [
    { id: 'c1', name: 'Start Timer', trigger: 'pomo start' },
    { id: 'c2', name: 'Stop Timer', trigger: 'pomo stop' },
  ]),
  makeExt('GitHub', 'extension', [{ id: 'c3', name: 'Search Repos', trigger: 'gh repos' }]),
];

describe('filterExtensions', () => {
  describe('filter = all, query = empty', () => {
    it('returns all extensions', () => {
      expect(filterExtensions(extensions, '', 'all')).toHaveLength(3);
    });

    it('returns all when query is only whitespace', () => {
      expect(filterExtensions(extensions, '   ', 'all')).toHaveLength(3);
    });
  });

  describe('query matching', () => {
    it('matches extension name case-insensitively', () => {
      const res = filterExtensions(extensions, 'pomo', 'all');
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('Pomodoro Timer');
    });

    it('matches command name case-insensitively', () => {
      const res = filterExtensions(extensions, 'start timer', 'all');
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('Pomodoro Timer');
    });

    it('matches command trigger case-insensitively', () => {
      const res = filterExtensions(extensions, 'gh repos', 'all');
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('GitHub');
    });

    it('returns empty array when query matches nothing', () => {
      expect(filterExtensions(extensions, 'xyz', 'all')).toHaveLength(0);
    });

    it('trims whitespace around query', () => {
      expect(filterExtensions(extensions, '  github  ', 'all')).toHaveLength(1);
    });
  });

  describe('type filter', () => {
    it('filters by "theme"', () => {
      const res = filterExtensions(extensions, '', 'theme');
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('Catppuccin');
    });

    it('filters by "extension"', () => {
      const res = filterExtensions(extensions, '', 'extension');
      expect(res).toHaveLength(2);
      expect(res.map((e) => e.title)).toEqual(['Pomodoro Timer', 'GitHub']);
    });

    it('returns empty when filter has no matches', () => {
      const res = filterExtensions([makeExt('A', 'theme')], '', 'extension');
      expect(res).toHaveLength(0);
    });
  });

  describe('combined filter and query', () => {
    it('applies both filter and query together', () => {
      const res = filterExtensions(extensions, 'timer', 'extension');
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('Pomodoro Timer');
    });

    it('returns empty when query matches but type does not', () => {
      expect(filterExtensions(extensions, 'catppuccin', 'extension')).toHaveLength(0);
    });

    it('returns empty when type matches but query does not', () => {
      expect(filterExtensions(extensions, 'nomatch', 'theme')).toHaveLength(0);
    });

    it('handles query with spaces on filtered set', () => {
      expect(filterExtensions(extensions, 'pomo stop', 'extension')).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty extensions list', () => {
      expect(filterExtensions([], 'test', 'all')).toHaveLength(0);
      expect(filterExtensions([], '', 'theme')).toHaveLength(0);
    });
  });
});
