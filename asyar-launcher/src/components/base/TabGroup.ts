import { cx, h } from '../../ui/h';
import { renderIcon } from './Icon';

export type TabItem = { id: string; label: string; icon?: string; count?: string };
export type TabGroupVariant = 'pills' | 'sidebar' | 'underline';

export type TabGroupProps = {
  tabs: TabItem[];
  activeTab: string;
  variant?: TabGroupVariant;
  onSelect?: (id: string) => void;
};

export function renderTabGroup({
  tabs,
  activeTab,
  variant = 'pills',
  onSelect,
}: TabGroupProps): HTMLElement {
  const sidebar = variant === 'sidebar';
  return h(
    'nav',
    {
      class: cx('tab-group', `tab-group--${variant}`),
      attrs: { role: sidebar ? 'tablist' : undefined },
    },
    tabs.map((tab) =>
      h(
        'button',
        {
          class: cx('tab-item', { active: activeTab === tab.id }),
          attrs: {
            type: 'button',
            role: sidebar ? 'tab' : undefined,
            'aria-selected': sidebar ? activeTab === tab.id : undefined,
          },
          on: onSelect
            ? {
                click: () => onSelect(tab.id),
              }
            : undefined,
        },
        sidebar && tab.icon
          ? h('span', { class: 'tab-item-icon' }, renderIcon({ name: tab.icon, size: 16 }))
          : null,
        h('span', { class: 'tab-item-label' }, tab.label),
        sidebar && tab.count ? h('span', { class: 'tab-item-count' }, tab.count) : null,
      ),
    ),
  );
}

// Legacy path — kept for import compatibility after the React migration.
import { TabGroup } from '../react/Interactive';
export { TabGroup };
export default TabGroup;
