import { nameToGradient, nameToInitials } from '../../lib/extensionAvatar';
import { cx, h } from '../../ui/h';

export type ExtensionAvatarProps = {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

function initialsView(name: string, sizeClass: string): HTMLDivElement {
  const gradient = nameToGradient(name);
  const bg = `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`;
  return h(
    'div',
    {
      class: cx('ext-avatar', sizeClass),
      style: { background: bg },
    },
    nameToInitials(name),
  );
}

export function renderExtensionAvatar({
  name,
  src,
  size = 'md',
}: ExtensionAvatarProps): HTMLDivElement {
  const sizeClass = `size-${size}`;
  if (!src) return initialsView(name, sizeClass);

  const el = h('div', { class: cx('ext-avatar', sizeClass, 'image-container') }, [
    h('img', {
      attrs: { src, alt: name },
      on: {
        error: () => {
          const next = initialsView(name, sizeClass);
          el.replaceWith(next);
        },
      },
    }),
  ]);
  return el;
}
