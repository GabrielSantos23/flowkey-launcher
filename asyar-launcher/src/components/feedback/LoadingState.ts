import { h } from '../../ui/h';
import { renderSpinner } from '../base/Spinner';

export type LoadingStateProps = {
  message?: string;
};

export function renderLoadingState({
  message = 'Loading...',
}: LoadingStateProps = {}): HTMLDivElement {
  return h(
    'div',
    { class: 'loading-state' },
    renderSpinner({ accent: true }),
    h('div', { class: 'loading-text text-caption' }, message),
  );
}
