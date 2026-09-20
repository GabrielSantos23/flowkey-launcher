// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

if (!Element.prototype.animate) {
  Element.prototype.animate = () =>
    ({
      cancel: () => {},
      finish: () => {},
      finished: Promise.resolve(),
      onfinish: null,
      play: () => {},
      pause: () => {},
    }) as unknown as Animation;
}

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../../lib/ipc/commands', () => ({
  hideWindow: vi.fn(async () => {}),
}));
vi.mock('../../services/feedback/internal/feedbackCommands', () => ({}));
vi.mock('../../services/notification/notificationService', () => ({
  notificationService: {},
}));

import { feedbackService } from '../../services/feedback/feedbackService';
import ToastHost from './ToastHost';

beforeEach(() => {
  feedbackService.reset();
});

describe('ToastHost', () => {
  it('lets users dismiss a non-actionable rare announcement', async () => {
    feedbackService.activeAnnouncement = {
      id: 'release-1',
      title: 'SDK Playground announcement',
      extensionId: 'org.asyar.sdk-playground',
    };

    render(<ToastHost />);
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));

    expect(feedbackService.activeAnnouncement).toBeNull();
  });
});
