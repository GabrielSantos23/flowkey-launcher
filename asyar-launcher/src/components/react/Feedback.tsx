import { useState } from 'react';
import { cx } from '../../utils/cx';
import { nameToGradient, nameToInitials } from '../../lib/extensionAvatar';

export { StatusDot, type StatusDotProps } from './Badge';

export type ExtensionAvatarProps = {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

export function ExtensionAvatar({ name, src, size = 'md' }: ExtensionAvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = `size-${size}`;

  if (!src || failed) {
    const gradient = nameToGradient(name);
    return (
      <div
        className={cx('ext-avatar', sizeClass)}
        style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
      >
        {nameToInitials(name)}
      </div>
    );
  }

  return (
    <div className={cx('ext-avatar', sizeClass, 'image-container')}>
      <img src={src} alt={name} onError={() => setFailed(true)} />
    </div>
  );
}

export type EmptyStateProps = {
  icon?: React.ReactNode;
  message?: string;
  description?: string;
  children?: React.ReactNode;
  /** Inline variant for a section that is empty while the view has content. */
  compact?: boolean;
  /** Dashed outline — the empty state doubles as the "create first item" affordance. */
  bordered?: boolean;
};

export function EmptyState({
  icon,
  message,
  description,
  children,
  compact = false,
  bordered = false,
}: EmptyStateProps) {
  return (
    <div className={cx('empty-state', { compact, bordered })}>
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <div className="empty-state-message text-title">{message}</div>
      {description ? (
        <div className="empty-state-description text-caption">{description}</div>
      ) : null}
      {children ? <div className="empty-state-actions">{children}</div> : null}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return <p className="inline-error">{message}</p>;
}

export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="loading-state">
      <span className="spinner spinner--md accent" aria-hidden="true" />
      <div className="loading-text">{message}</div>
    </div>
  );
}

export type WarningBannerProps = {
  children?: React.ReactNode;
  message?: React.ReactNode;
  actions?: React.ReactNode;
};

export function WarningBanner({ children, message, actions }: WarningBannerProps) {
  return (
    <div className="warning-banner">
      <div className="banner-icon">⚠️</div>
      <div className="banner-content">
        {message ?? children}
        {actions ? <div className="banner-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export type CardProps = {
  title?: string;
  children?: React.ReactNode;
};

export function Card({ title, children }: CardProps) {
  return (
    <div className="p-[var(--space-6)] rounded-[var(--radius-lg)] mb-[var(--space-6)] border border-[var(--border-color)] flex-shrink-0 bg-[var(--bg-secondary)]">
      {title ? (
        <h2 className="text-xl font-semibold mb-[var(--space-4)] text-[var(--text-primary)]">
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  );
}

export type FormFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  children: React.ReactNode;
};

export function FormField({ label, hint = '', error = '', id, children }: FormFieldProps) {
  return (
    <div className={cx('form-field', { 'has-error': !!error })}>
      <label className="form-field-label" htmlFor={id || undefined}>
        {label}
      </label>
      <div className="form-field-control">{children}</div>
      {error ? (
        <p className="form-field-error">{error}</p>
      ) : hint ? (
        <p className="form-field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
