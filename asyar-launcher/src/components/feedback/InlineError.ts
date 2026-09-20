import { h } from '../../ui/h';

export type InlineErrorProps = { message: string };

export function renderInlineError({ message }: InlineErrorProps): HTMLParagraphElement {
  return h('p', { class: 'inline-error' }, message);
}
