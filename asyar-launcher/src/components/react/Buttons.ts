import Button, { ButtonProps, buttonClass } from './Button';
export { Button, buttonClass };
export type { ButtonProps };
export default Button;

// IconButton lives in Interactive.tsx; re-exported for toolbar imports.
export { IconButton, type IconButtonProps } from './Interactive';
