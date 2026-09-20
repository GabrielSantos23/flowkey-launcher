import { useId } from 'react';
import { cx } from '../../utils/cx';
import { getTextIntentAttributes, type TextIntent } from '../base/textIntent';
export { Toggle, type ToggleProps } from '../base/Toggle';
export type { TextIntent };

export type InputProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (e: any) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  rows?: number;
  multiline?: boolean;
  unstyled?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  ref?: any;
  textIntent?: TextIntent;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'>;

/**
 * Text entry control. Controlled when `value`/`onValueChange` are provided,
 * unmanaged otherwise. `multiline` renders a textarea instead of an input.
 */
export function Input({
  value,
  defaultValue,
  onValueChange,
  onChange,
  placeholder = '',
  disabled = false,
  type = 'text',
  rows,
  multiline = false,
  unstyled = false,
  className,
  id,
  autoFocus,
  ref,
  textIntent,
  ...rest
}: InputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onValueChange?.(e.target.value);
    onChange?.(e);
  };
  const intentAttrs = textIntent ? getTextIntentAttributes(textIntent) : {};
  const shared = {
    ref,
    className: cx({ input: !unstyled }, className),
    placeholder,
    disabled,
    id: id || undefined,
    autoFocus,
    value,
    defaultValue,
    onChange: handleChange,
    ...intentAttrs,
    ...rest,
  };
  if (multiline) {
    return <textarea {...shared} rows={rows !== undefined ? Number(rows) : undefined} />;
  }
  return <input {...shared} type={type} />;
}

export function Textarea(props: Omit<InputProps, 'multiline'>) {
  return <Input multiline {...props} />;
}

export type CheckboxProps = {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (e: any) => void;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'className'>;

export function Checkbox({
  id: idProp,
  checked,
  defaultChecked,
  disabled = false,
  onCheckedChange,
  onChange,
  className,
  children,
  ...rest
}: CheckboxProps) {
  const generatedId = useId();
  const id = idProp || generatedId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckedChange?.(e.target.checked);
    if (onChange) {
      if (onChange.length === 1 && typeof e.target?.checked === 'boolean') {
        // Support both callback(boolean) and callback(event)
        try {
          onChange(e.target.checked);
        } catch {
          onChange(e);
        }
      } else {
        onChange(e);
      }
    }
  };

  return (
    <div
      className={cx(
        'checkbox-wrapper inline-flex items-center gap-2 cursor-pointer select-none',
        { 'opacity-50 pointer-events-none': disabled },
        className,
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={handleChange}
        className="checkbox-input rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] accent-[var(--accent-color)] w-4 h-4 cursor-pointer"
        {...rest}
      />
      {children && (
        <label htmlFor={id} className="cursor-pointer">
          {children}
        </label>
      )}
    </div>
  );
}

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (value: any) => void;
  options: (string | SelectOption)[];
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function Select({
  value,
  defaultValue,
  onValueChange,
  onChange,
  options,
  disabled = false,
  className,
  id,
}: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(e.target.value);
    if (onChange) {
      try {
        onChange(e.target.value);
      } catch {
        onChange(e);
      }
    }
  };

  return (
    <select
      id={id}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={handleChange}
      className={cx('select', className)}
    >
      {options.map((opt) => {
        const option = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        return (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        );
      })}
    </select>
  );
}

// FormField lives in Feedback.tsx; re-exported here because form imports reach for Inputs.
export { FormField, type FormFieldProps } from './Feedback';
