// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

vi.mock('../../../services/browser/browserService', () => ({
  browserService: {
    listAvailableBrowsers: vi.fn(async () => []),
    listPairedBrowsers: vi.fn(async () => []),
    isCompanionInstalled: vi.fn(async () => false),
  },
}));

vi.mock('../../../services/feedback/feedbackService', () => ({
  feedbackService: { report: vi.fn() },
}));

import BrowsersTab from './BrowsersTab';

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockClear();
});

describe('Settings → Browsers tab', () => {
  it('shows empty state when no browsers paired', async () => {
    invokeMock.mockResolvedValue([]);
    render(<BrowsersTab />);
    await screen.findByText(/No browsers paired/i);
  });

  it('opens the Chrome Web Store companion listing when "Install for Chrome" is clicked', async () => {
    invokeMock.mockResolvedValue([]);
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    render(<BrowsersTab />);
    const btn = await screen.findByTestId('install-chromium');
    await fireEvent.click(btn);
    expect(openUrl).toHaveBeenCalledWith(
      'https://chromewebstore.google.com/detail/clgmndlecfeilanhmiohfjmgfgilpjic',
    );
  });
});
