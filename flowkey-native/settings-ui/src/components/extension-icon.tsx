import { cn } from '@/lib/utils';
import type { SettingsIconState } from '@/types';

/**
 * Renders a shell-resolved extension mark: PNG data URIs for brand artwork
 * and lucide glyphs, emoji text natively. The shell decides the payload —
 * the page never resolves icons itself.
 */
export function ExtensionIcon({
  icon,
  className,
}: {
  icon: SettingsIconState | null | undefined;
  className?: string;
}) {
  if (!icon) {
    return <span className={cn('inline-block', className)} />;
  }
  if (icon.kind === 'emoji' && icon.emoji) {
    return (
      <span className={cn('inline-flex items-center justify-center leading-none', className)}>
        {icon.emoji}
      </span>
    );
  }
  if (icon.kind === 'image' && icon.dataUri) {
    return (
      <img
        src={icon.dataUri}
        alt=""
        className={cn('object-contain', className)}
        draggable={false}
      />
    );
  }
  return <span className={cn('inline-block', className)} />;
}
