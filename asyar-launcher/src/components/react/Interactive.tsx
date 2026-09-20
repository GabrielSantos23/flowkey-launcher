import { cx } from '../../utils/cx';
import { Icon } from './Icon';

export type IconBoxProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  children?: React.ReactNode;
};

export function IconBox({ size = 'md', rounded = 'md', children }: IconBoxProps) {
  return <div className={cx('icon-box', `size-${size}`, `rounded-${rounded}`)}>{children}</div>;
}

export type IconButtonProps = {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  tabIndex?: number;
  className?: string;
  variant?: 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
};

export function IconButton({
  onClick,
  disabled = false,
  title,
  ariaLabel,
  tabIndex,
  className,
  variant = 'ghost',
  size = 'md',
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onClick={onClick}
      className={cx('icon-button', `size-${size}`, `variant-${variant}`, className)}
    >
      {children}
    </button>
  );
}

export type StatTileProps = {
  value: string | number;
  label: string;
  icon?: string;
  accent?: boolean;
  divided?: boolean;
};

export function StatTile({ value, label, icon, accent = false, divided = false }: StatTileProps) {
  return (
    <div className={cx('stat-tile', { divided })}>
      <div className={cx('stat-value', { accent })}>{value}</div>
      <div className="stat-label">
        {icon ? <Icon name={icon} size={13} /> : null}
        <span>{label}</span>
      </div>
    </div>
  );
}

export type TabItem = { id: string; label: string; icon?: string; count?: string };
export type TabGroupVariant = 'pills' | 'sidebar' | 'underline';

export type TabGroupProps = {
  tabs: TabItem[];
  activeTab: string;
  variant?: TabGroupVariant;
  onSelect?: (id: string) => void;
};

export function TabGroup({ tabs, activeTab, variant = 'pills', onSelect }: TabGroupProps) {
  const sidebar = variant === 'sidebar';
  return (
    <nav
      className={cx('tab-group', `tab-group--${variant}`)}
      role={sidebar ? 'tablist' : undefined}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role={sidebar ? 'tab' : undefined}
          aria-selected={sidebar ? activeTab === tab.id : undefined}
          className={cx('tab-item', { active: activeTab === tab.id })}
          onClick={() => onSelect?.(tab.id)}
        >
          {sidebar && tab.icon ? (
            <span className="tab-item-icon">
              <Icon name={tab.icon} size={16} />
            </span>
          ) : null}
          <span className="tab-item-label">{tab.label}</span>
          {sidebar && tab.count ? <span className="tab-item-count">{tab.count}</span> : null}
        </button>
      ))}
    </nav>
  );
}
