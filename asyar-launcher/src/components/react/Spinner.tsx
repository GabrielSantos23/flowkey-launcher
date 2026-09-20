import { cx } from '../../utils/cx';

export type SpinnerSize = 'inline' | 'sm' | 'md';

export type SpinnerProps = {
  size?: SpinnerSize;
  accent?: boolean;
  label?: string;
};

export function Spinner({ size = 'md', accent = false, label }: SpinnerProps) {
  return (
    <span
      className={cx('spinner', `spinner--${size}`, { accent })}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
