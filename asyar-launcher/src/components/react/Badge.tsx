import React from 'react';
import { cx } from '../../utils/cx';
export { default as KeyboardHint } from '../base/KeyboardHint';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export type BadgeProps = {
  text: string;
  variant?: BadgeVariant;
  mono?: boolean;
  bordered?: boolean;
};

export function Badge({ text, variant = 'default', mono = false, bordered = false }: BadgeProps) {
  return <span className={cx('badge', `badge-${variant}`, { mono, bordered })}>{text}</span>;
}

export type StatusDotProps = {
  status?: 'online' | 'offline' | 'warning' | 'error' | 'success' | 'idle' | string;
  color?: 'success' | 'warning' | 'danger' | 'info' | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function StatusDot({
  status,
  color = 'online',
  size = 'md',
  className = '',
}: StatusDotProps) {
  const finalStatus = status || color;
  return (
    <span
      className={cx(
        'status-dot inline-block rounded-full',
        `status-${finalStatus}`,
        `size-${size}`,
        className,
      )}
    />
  );
}
