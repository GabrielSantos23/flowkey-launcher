// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

if (typeof Element !== 'undefined' && !Element.prototype.animate) {
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

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

vi.mock('./aliasService', () => ({
  aliasService: {
    register: vi.fn(),
    findConflict: vi.fn(),
  },
}));

vi.mock('./aliasStore', () => ({
  aliasStore: {
    addOptimistic: vi.fn(),
  },
}));

vi.mock('../../services/log/logService', () => ({
  logService: {
    error: vi.fn(),
  },
}));

import AliasCapture from './AliasCapture';
import { aliasService } from './aliasService';

const mockedAliasService = vi.mocked(aliasService);

describe('AliasCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAliasService.findConflict.mockResolvedValue(null);
    mockedAliasService.register.mockResolvedValue({
      objectId: 'obj-1',
      alias: 'c',
      itemName: 'Calculator',
      itemType: 'application',
    } as any);
  });

  it('saves (does not cancel) when Enter is pressed after typing a valid alias', async () => {
    const onsave = vi.fn();
    const oncancel = vi.fn();
    const { container } = render(
      <AliasCapture
        objectId="obj-1"
        itemName="Calculator"
        itemType="application"
        onsave={onsave}
        oncancel={oncancel}
      />,
    );

    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    await fireEvent.input(input, { target: { value: 'c' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(oncancel).not.toHaveBeenCalled();
  });
});
