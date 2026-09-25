import type { NativeCallMessage, NativeResultMessage, SidecarMessage } from '@flowkey/native-sdk';

const NATIVE_CALL_TIMEOUT_MS = 5000;

interface PendingNativeCall {
  resolve: (result: unknown) => void;
  reject: (error: { code: string; message: string }) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}

export interface NativeCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class NativeBridge {
  private pending = new Map<string, PendingNativeCall>();
  private nextRequestId = 1;

  constructor(private emit: (message: SidecarMessage) => void) {}

  call<T = unknown>(
    extensionId: string,
    method: string,
    params?: Record<string, unknown>,
    options?: NativeCallOptions,
  ): Promise<T> {
    const signal = options?.signal;
    const requestId = `n${this.nextRequestId++}`;
    if (signal?.aborted) {
      return Promise.reject({ code: 'aborted', message: `native method ${method} aborted` });
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        clearTimeout(timer);
        this.pending.delete(requestId);
        fn();
      };
      const onAbort = () => {
        settle(() => reject({ code: 'aborted', message: `native method ${method} aborted` }));
      };
      const timer = setTimeout(() => {
        settle(() =>
          reject({ code: 'nativeTimeout', message: `native method ${method} timed out` }),
        );
      }, options?.timeoutMs ?? NATIVE_CALL_TIMEOUT_MS);
      this.pending.set(requestId, {
        resolve: (result) => settle(() => resolve(result as T)),
        reject: (error) => settle(() => reject(error)),
        timer,
        cleanup: () => settle(() => {}),
      });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const message: NativeCallMessage = {
        type: 'nativeCall',
        requestId,
        extensionId,
        method,
        params,
      };
      this.emit(message);
    });
  }

  handleResult(message: NativeResultMessage): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(message.error);
    }
  }

  failAll(error: { code: string; message: string }): void {
    for (const [, pending] of this.pending) {
      pending.reject(error);
      pending.cleanup();
    }
  }
}
