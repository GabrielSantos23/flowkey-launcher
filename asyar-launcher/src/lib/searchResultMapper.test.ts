import { describe, it, expect, vi } from 'vitest';
import { buildMappedItems } from './searchResultMapper';
import type { Run } from 'asyar-sdk/contracts';

function makeRun(partial: Partial<Run> & { id: string; status: Run['status'] }): Run {
  return {
    kind: 'script',
    callerId: 'test-script',
    label: 'Test Script',
    startedAt: Date.now() - 5000,
    ...partial,
  };
}

describe('searchResultMapper', () => {
  it('succeeded run row uses tailOutput as subtitle', () => {
    const run = makeRun({
      id: 'r-success',
      status: 'succeeded',
      tailOutput: 'All tests passed',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
      scriptResultRuns: [run],
    });

    expect(mappedItems[0].subtitle).toBe('All tests passed');
  });

  it('failed run row subtitle prefers tailOutput over errorMessage', () => {
    const run = makeRun({
      id: 'r-fail',
      status: 'failed',
      tailOutput: 'Process killed with signal',
      errorMessage: 'exit 1',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
      failedRuns: [run],
    });

    expect(mappedItems[0].subtitle).toBe('Failed · Process killed with signal');
  });

  it('failed run row subtitle falls back to errorMessage when tailOutput is missing', () => {
    const run = makeRun({
      id: 'r-fail',
      status: 'failed',
      errorMessage: 'exit 1',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
      failedRuns: [run],
    });

    expect(mappedItems[0].subtitle).toBe('Failed · exit 1');
  });

  it('succeeded run row with no tailOutput shows finished duration', () => {
    const now = Date.now();
    const run = makeRun({
      id: 'r-done',
      status: 'succeeded',
      startedAt: now - 3000,
      endedAt: now,
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
      scriptResultRuns: [run],
    });

    expect(mappedItems[0].subtitle).toBe('Finished in 3s');
  });
});
