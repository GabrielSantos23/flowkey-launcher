import { icons } from '../../lib/icons';
import { cx } from '../../utils/cx';

export type IconProps = {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 20, className = '', strokeWidth = 1.5 }: IconProps) {
  if (import.meta.env.DEV && !icons[name]) {
    console.warn(`Icon: unrecognized icon name "${name}" — rendering a blank placeholder.`);
  }

  if (!icons[name]) {
    return <span className="inline-block" style={{ width: size, height: size }} />;
  }

  return (
    <svg
      className={cx(className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
