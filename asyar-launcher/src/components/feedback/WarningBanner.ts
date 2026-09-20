import { h, type Child } from '../../ui/h';

export type WarningBannerProps = {
  children?: Child;
  actions?: Child;
};

export function renderWarningBanner({ children, actions }: WarningBannerProps): HTMLDivElement {
  return h(
    'div',
    { class: 'warning-banner' },
    h('div', { class: 'banner-icon' }, '⚠️'),
    h(
      'div',
      { class: 'banner-content' },
      children,
      actions ? h('div', { class: 'banner-actions' }, actions) : null,
    ),
  );
}
