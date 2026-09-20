/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../services/extension/extensionDiscovery', () => ({
  isBuiltInFeature: vi.fn((id: string) => id === 'test-builtin'),
}));

vi.mock('../../services/search/searchBarAccessoryService', () => ({
  searchBarAccessoryService: {
    active: null,
    clear: vi.fn(),
  },
}));

vi.mock('../../services/search/applyAccessoryFromCommand', () => ({
  applyAccessoryFromCommand: vi.fn(),
}));

import ExtensionViewContainer from './ExtensionViewContainer';
import TestView from '../../built-in-features/help/DefaultView';

describe('ExtensionViewContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('safely renders fallback error when viewName does not match and module.default is an object', () => {
    const mockModule = {
      DefaultView: TestView,
      default: {
        someMethod: vi.fn(),
      },
    };

    const mockExtensionManager = {
      getManifestById: vi.fn().mockReturnValue({
        id: 'test-builtin',
        commands: [],
      }),
      getLoadedExtensionModule: vi.fn().mockReturnValue(mockModule),
    };

    const { container } = render(
      <ExtensionViewContainer
        activeView="test-builtin/__TBD__"
        extensionManager={mockExtensionManager as any}
      />,
    );

    expect(container.textContent).toContain(
      "Error: Built-in feature test-builtin has no export matching '__TBD__'",
    );
  });
});
