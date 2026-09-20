import React from 'react';

export interface SettingsFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children?: React.ReactNode;
}

export default function SettingsForm({ children, className = '', ...rest }: SettingsFormProps) {
  return (
    <form className={`settings-form flex flex-col gap-4 ${className}`} {...rest}>
      {children}
    </form>
  );
}
