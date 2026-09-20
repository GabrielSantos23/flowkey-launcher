import React from 'react';
import { Input } from '../react/Inputs';
import { Select } from '../react/Inputs';
import SettingsFormRow from './SettingsFormRow';
import type { PreferenceDeclaration } from 'asyar-sdk/contracts';

export interface ExtensionPreferencesFormProps {
  preferences: PreferenceDeclaration[];
  values: Record<string, any>;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (name: string, value: any) => void;
}

export default function ExtensionPreferencesForm({
  preferences,
  values = {},
  errors = {},
  disabled = false,
  onChange,
}: ExtensionPreferencesFormProps) {
  const handleValueChange = (name: string, value: any) => {
    if (disabled) return;
    onChange(name, value);
  };

  const dropdownValue = (pref: PreferenceDeclaration): string => {
    const v = values[pref.name];
    if (typeof v === 'string') return v;
    if (typeof pref.default === 'string') return pref.default;
    return pref.data?.[0]?.value ?? '';
  };

  const dropdownOptions = (pref: PreferenceDeclaration) => {
    return (pref.data ?? []).map((d) => ({ value: d.value, label: d.title }));
  };

  return (
    <div className="extension-preferences-form flex flex-col gap-2">
      {preferences.map((pref) => (
        <SettingsFormRow
          key={pref.name}
          label={pref.title}
          hint={pref.description ?? ''}
          error={errors[pref.name]}
        >
          <div className="control-wrapper flex flex-col gap-1">
            {pref.type === 'textfield' ? (
              <Input
                value={values[pref.name] ?? ''}
                placeholder={pref.placeholder ?? ''}
                disabled={disabled}
                onChange={(e) => handleValueChange(pref.name, e.target.value)}
              />
            ) : pref.type === 'password' ? (
              <Input
                value={values[pref.name] ?? ''}
                type="password"
                placeholder={pref.placeholder ?? ''}
                disabled={disabled}
                onChange={(e) => handleValueChange(pref.name, e.target.value)}
              />
            ) : pref.type === 'number' ? (
              <Input
                value={values[pref.name] ?? ''}
                type="number"
                placeholder={pref.placeholder ?? ''}
                disabled={disabled}
                onChange={(e) =>
                  handleValueChange(
                    pref.name,
                    e.target.value === '' ? undefined : Number(e.target.value),
                  )
                }
              />
            ) : pref.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!values[pref.name]}
                disabled={disabled}
                onChange={(e) => handleValueChange(pref.name, e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-color)] accent-[var(--accent-primary)] cursor-pointer"
              />
            ) : pref.type === 'dropdown' ? (
              pref.data && pref.data.length > 0 ? (
                <Select
                  value={dropdownValue(pref)}
                  options={dropdownOptions(pref)}
                  disabled={disabled}
                  onChange={(v) => handleValueChange(pref.name, v)}
                />
              ) : (
                <div className="text-xs text-[var(--accent-danger)]">
                  Invalid dropdown configuration
                </div>
              )
            ) : pref.type === 'appPicker' || pref.type === 'file' || pref.type === 'directory' ? (
              <Input
                type="text"
                value={values[pref.name] ?? ''}
                placeholder={
                  pref.type === 'appPicker'
                    ? 'Application path'
                    : pref.type === 'directory'
                      ? 'Directory path'
                      : 'File path'
                }
                disabled={disabled}
                onChange={(e) => handleValueChange(pref.name, e.target.value)}
              />
            ) : (
              <div className="text-xs text-[var(--accent-danger)]">Unknown type: {pref.type}</div>
            )}
          </div>
        </SettingsFormRow>
      ))}
    </div>
  );
}
