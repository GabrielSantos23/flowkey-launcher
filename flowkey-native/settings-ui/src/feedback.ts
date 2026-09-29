import { toast } from 'sonner';
import type { InvokeResult } from '@/bridge';

/**
 * Feedback helper for settings ops: toasts the shell's rejection on failure,
 * otherwise the caller's success message. Errors surface as destructive
 * toasts top-right, matching the update toasts.
 */
export function toastResult(result: InvokeResult, successMessage: string): InvokeResult {
  if (!result.ok) {
    toast.error('Action failed', { description: result.error ?? 'Unknown error' });
  } else if (successMessage.length > 0) {
    toast.success(successMessage);
  }
  return result;
}
