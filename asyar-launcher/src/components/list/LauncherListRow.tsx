import React from 'react';
import { isIconImage, isBuiltInIcon, getBuiltInIconName } from '../../lib/iconUtils';
import { toDisplayKeys } from '../../built-in-features/shortcuts/shortcutFormatter';
import { Icon } from '../react/Icon';
import { KeyboardHint, StatusDot } from '../react/Indicators';
import type { ItemStatus } from '../../services/launcher/itemStatusLogic';

export interface LauncherListRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  multiSelected?: boolean;
  icon?: string;
  bareIcon?: boolean;
  destructive?: boolean;
  title: string;
  subtitle?: string;
  alias?: string;
  shortcut?: string;
  shortcutPlacement?: 'inline' | 'trailing';
  typeLabel?: string;
  status?: ItemStatus | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export default function LauncherListRow({
  selected = false,
  multiSelected = false,
  icon,
  bareIcon = false,
  destructive = false,
  title,
  subtitle,
  alias,
  shortcut,
  shortcutPlacement = 'inline',
  typeLabel,
  status = null,
  leading,
  trailing,
  className = '',
  ...rest
}: LauncherListRowProps) {
  return (
    <button
      type="button"
      className={`result-item ${selected ? 'selected-result' : ''} ${
        multiSelected ? 'multi-selected-result' : ''
      } ${className}`}
      {...rest}
    >
      <div className="flex items-center w-full gap-[var(--space-5-5)]">
        {leading ? (
          leading
        ) : icon ? (
          bareIcon ? (
            <div
              className={`w-[var(--size-lg)] h-[var(--size-lg)] flex items-center justify-center shrink-0 ${
                destructive ? 'text-[var(--accent-danger)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {isBuiltInIcon(icon) ? (
                <Icon name={getBuiltInIconName(icon)} size={16} />
              ) : isIconImage(icon) ? (
                <img
                  src={icon}
                  alt={title}
                  className="w-[var(--size-lg)] h-[var(--size-lg)] object-contain shrink-0"
                />
              ) : (
                <span className="text-[var(--font-size-sm)]">{icon}</span>
              )}
            </div>
          ) : isBuiltInIcon(icon) ? (
            <div className="w-[var(--size-lg)] h-[var(--size-lg)] flex items-center justify-center shrink-0 rounded-[var(--radius-sm)] bg-[var(--accent-primary-fill)] text-[var(--text-on-accent)]">
              <Icon name={getBuiltInIconName(icon)} size={15} />
            </div>
          ) : isIconImage(icon) ? (
            <img
              src={icon}
              alt={title}
              className="w-[var(--size-lg)] h-[var(--size-lg)] object-contain rounded-[var(--radius-xs)] shrink-0"
            />
          ) : (
            <div className="w-[var(--size-lg)] h-[var(--size-lg)] flex items-center justify-center text-[var(--text-secondary)] text-[var(--font-size-sm)] shrink-0 rounded-[var(--radius-xs)]">
              {icon}
            </div>
          )
        ) : null}

        <div className="flex-1 flex items-center min-w-0 gap-[var(--space-5-5)]">
          <span
            className={`result-title truncate ${destructive ? 'text-[var(--accent-danger)]' : ''}`}
          >
            {title}
          </span>
          {status ? (
            <StatusDot
              color={status === 'active' ? 'info' : status === 'failed' ? 'danger' : 'success'}
              pulse={status === 'active'}
              size={6}
            />
          ) : null}
          {subtitle ? (
            <span
              className="font-medium text-[var(--text-secondary)] truncate shrink"
              style={{ fontSize: 'var(--font-size-md)' }}
            >
              {subtitle}
            </span>
          ) : null}
          {alias ? (
            <span data-test="alias-chip" className="alias-chip font-mono text-xs">
              {alias}
            </span>
          ) : null}
          {shortcut && shortcutPlacement === 'inline' ? (
            <KeyboardHint keys={toDisplayKeys(shortcut)} />
          ) : null}
        </div>

        {trailing ? (
          trailing
        ) : shortcut && shortcutPlacement === 'trailing' ? (
          <div className="shrink-0 ml-auto">
            <KeyboardHint keys={toDisplayKeys(shortcut)} />
          </div>
        ) : typeLabel ? (
          <span
            className="font-medium text-[var(--text-secondary)] shrink-0 ml-auto"
            style={{ fontSize: 'var(--font-size-md)' }}
          >
            {typeLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}
