import { cx, h, type Child } from '../../ui/h';

export type EmptyStateProps = {
  icon?: Child;
  message?: string;
  description?: string;
  children?: Child;
  compact?: boolean;
  bordered?: boolean;
};

export function emptyStateClass({
  compact = false,
  bordered = false,
}: Pick<EmptyStateProps, 'compact' | 'bordered'>): string {
  return cx('empty-state', { compact, bordered });
}

export function renderEmptyState({
  icon,
  message = 'No items found',
  description,
  children,
  compact = false,
  bordered = false,
}: EmptyStateProps): HTMLDivElement {
  return h(
    'div',
    { class: emptyStateClass({ compact, bordered }) },
    icon ? h('div', { class: 'empty-state-icon' }, icon) : null,
    h('div', { class: 'empty-state-message text-title' }, message),
    description ? h('div', { class: 'empty-state-description text-caption' }, description) : null,
    children ? h('div', { class: 'empty-state-actions' }, children) : null,
  );
}
