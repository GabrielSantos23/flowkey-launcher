import { writeText } from 'tauri-plugin-clipboard-x-api';
import { feedbackService } from '../services/feedback/feedbackService';

/** Copy through the native clipboard and report the outcome without exposing content. */
export async function copyText(text: string): Promise<boolean> {
  let copied = false;
  try {
    await writeText(text);
    copied = true;
  } catch {
    // Clipboard errors may contain the text being copied; do not publish them.
  }
  await feedbackService.report({
    source: 'frontend',
    kind: 'manual',
    severity: copied ? 'success' : 'error',
    retryable: false,
    context: {
      message: copied ? 'Copied to clipboard' : 'Failed to copy to clipboard',
    },
  });
  return copied;
}
