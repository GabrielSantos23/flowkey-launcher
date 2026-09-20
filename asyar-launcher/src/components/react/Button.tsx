import React from 'react';
import { cx } from '../../utils/cx';

export type ButtonProps = {
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | string;
  size?: 'sm' | 'md' | 'lg' | string;
  disabled?: boolean;
  fullWidth?: boolean;
  autofocus?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'disabled' | 'onClick' | 'className'
>;

export function buttonClass({
  fullWidth = false,
  variant,
  size,
  className = '',
}: { fullWidth?: boolean; variant?: string; size?: string; className?: string } = {}): string {
  return cx('btn', className, {
    'btn-full': fullWidth,
    'btn-primary': variant === 'primary',
    'btn-danger': variant === 'danger',
    'btn-ghost': variant === 'ghost',
    'btn-secondary': variant === 'secondary',
    [`btn-${size}`]: !!size,
  });
}

export function Button({
  type = 'button',
  variant,
  size,
  disabled = false,
  fullWidth = false,
  autofocus,
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      autoFocus={autofocus}
      onClick={onClick}
      className={buttonClass({ fullWidth, variant, size, className })}
      {...rest}
    >
      <span className="result-title">{children}</span>
    </button>
  );
}

export default Button;
