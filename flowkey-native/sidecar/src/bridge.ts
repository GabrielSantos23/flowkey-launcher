import type { NativeCallMessage, NativeResultMessage, SidecarMessage } from '@flowkey/native-sdk';

const NATIVE_CALL_TIMEOUT_MS = 5000;

interface PendingNativeCall {
  resolve: (result: unknown) => void;
  reject: (error: { code: string; message: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class NativeBridge {
  private pending = new Map<string, PendingNativeCall>();
  private nextRequestId = 1;

  constructor(private emit: (message: SidecarMessage) => void) {}

  call<T = unknown>(extensionId: string, method: string, params?: Record<string, unknown>): Promise<T> {
    const requestId = `n${this.nextRequestId++}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject({ code: 'nativeTimeout', message: `native method ${method} timed out` });
      }, NATIVE_CALL_TIMEOUT_MS);
      this.pending.set(requestId, { resolve: resolve as (result: unknown) => void, reject, timer });
      const message: NativeCallMessage = { type: 'nativeCall', requestId, extensionId, method, params };
      this.emit(message);
    });
  }

  handleResult(message: NativeResultMessage): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(message.error);
    }
  }

  failAll(error: { code: string; message: string }): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }
}
