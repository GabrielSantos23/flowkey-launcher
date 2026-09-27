import { describe, expect, spyOn, test } from 'bun:test';
import { captureException, randomId } from '../src/utils';

describe('randomId', () => {
  test('returns unique uuid-format ids', () => {
    const a = randomId();
    const b = randomId();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('captureException', () => {
  test('logs the error to console.error for sidecar stderr capture', () => {
    const logged: unknown[][] = [];
    const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    try {
      captureException(new Error('boom'));
      captureException('plain string failure');
    } finally {
      spy.mockRestore();
    }

    expect(logged.length).toBe(2);
    expect(logged[0][0]).toBe('[flowkey] captured exception');
    expect(logged[0][1]).toBeInstanceOf(Error);
    expect((logged[0][1] as Error).message).toBe('boom');
    expect(logged[1][1]).toBe('plain string failure');
  });
});
