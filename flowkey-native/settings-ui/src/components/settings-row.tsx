import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A settings row: card surface, label + optional description on the left, control on the right. */
export function SettingsRow({
  title,
  description,
  control,
  className,
  children,
  disabled = false,
}: {
  title?: string;
  description?: string | null;
  control?: ReactNode;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card rounded-lg px-3 py-2.5 mb-1.5 flex items-center justify-between gap-4',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {title && <div className="text-[13px] font-medium text-foreground">{title}</div>}
        {description && (
          <div className="text-xs text-text-tertiary mt-0.5 break-words">{description}</div>
        )}
        {children}
      </div>
      {control && <div className="flex-none flex items-center gap-2">{control}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-sm font-medium text-foreground mt-5 mb-1.5">{children}</div>;
}

export function PageHint({ children }: { children: ReactNode }) {
  return <div className="text-xs text-text-secondary mb-2.5">{children}</div>;
}

/** A keycap chip, mirroring the launcher's keycap styling. */
export function Keycap({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[5px] border border-keycap-border bg-keycap px-2 py-0.5 text-xs text-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Renders a combo string like "Ctrl+Alt+Space" as keycap chips. */
export function ComboChips({
  combo,
  className,
}: {
  combo: string | null | undefined;
  className?: string;
}) {
  if (!combo) {
    return null;
  }
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {combo.split('+').map((part, index) => (
        <Keycap key={`${part}-${index}`} label={part} />
      ))}
    </span>
  );
}
