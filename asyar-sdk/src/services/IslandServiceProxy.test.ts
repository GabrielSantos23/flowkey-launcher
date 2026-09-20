import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IslandServiceProxy } from './IslandServiceProxy';
import { messageBroker } from '../ipc/MessageBroker';

vi.mock('../ipc/MessageBroker', () => ({
  messageBroker: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

function makeProxy() {
  const mockInvoke = vi.fn().mockResolvedValue(undefined);
  Object.assign(messageBroker, {
    invoke: mockInvoke,
    on: vi.fn(),
    off: vi.fn(),
  });
  const proxy = new IslandServiceProxy();
  proxy.setExtensionId('ext.test');
  return { proxy, mockInvoke };
}

describe('IslandServiceProxy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('show → "island:show" with options', async () => {
    const { proxy, mockInvoke } = makeProxy();
    await proxy.show({ icon: '🎵', title: 'Candy Paint', subtitle: 'Post Malone' });
    const call = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'island:show');
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({
      options: { icon: '🎵', title: 'Candy Paint', subtitle: 'Post Malone' },
    });
  });

  it('show omits optional fields cleanly', async () => {
    const { proxy, mockInvoke } = makeProxy();
    await proxy.show({ title: 'Saved' });
    const call = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'island:show');
    expect(call![1]).toEqual({ options: { title: 'Saved' } });
  });

  it('show forwards pinned', async () => {
    const { proxy, mockInvoke } = makeProxy();
    await proxy.show({ title: 'Recording', pinned: true });
    const call = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === 'island:show');
    expect(call![1]).toMatchObject({ options: { title: 'Recording', pinned: true } });
  });

  it('dismiss → "island:dismiss"', async () => {
    const { proxy, mockInvoke } = makeProxy();
    await proxy.dismiss();
    expect(mockInvoke.mock.calls.some((c) => c[0] === 'island:dismiss')).toBe(true);
  });
});
