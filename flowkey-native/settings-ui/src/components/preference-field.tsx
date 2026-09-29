import { useState } from 'react';
import { invoke } from '@/bridge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/settings-row';
import type {
  PreferenceDraft,
  PreferenceValue,
  SettingsAppOption,
  SettingsPreferenceField,
} from '@/types';

/**
 * One preference form row, ported from the former SettingsWindow
 * BuildExtensionForm: checkbox and dropdown edit inline; text and password
 * open an edit dialog; file and directory open the shell's native picker via
 * browsePath and update the draft. Nothing persists until the form's Save
 * button posts setPreferences.
 */
export function PreferenceFieldRow({
  field,
  draft,
  onDraftChange,
  appChoices,
}: {
  field: SettingsPreferenceField;
  draft: PreferenceDraft;
  onDraftChange: (name: string, value: PreferenceValue) => void;
  appChoices: SettingsAppOption[];
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorValue, setEditorValue] = useState('');
  const [busy, setBusy] = useState(false);

  const currentValue = draft[field.name];
  const textValue = typeof currentValue === 'string' ? currentValue : '';

  let control: React.ReactNode;
  switch (field.type) {
    case 'checkbox':
      control = (
        <Switch
          checked={currentValue === true}
          onCheckedChange={(checked) => onDraftChange(field.name, checked)}
        />
      );
      break;
    case 'dropdown':
      control = (
        <Select value={textValue} onValueChange={(value) => onDraftChange(field.name, value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case 'appPicker':
      control = (
        <Select value={textValue} onValueChange={(value) => onDraftChange(field.name, value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="(none)">(none)</SelectItem>
            {appChoices.map((app) => (
              <SelectItem key={app.value} value={app.value}>
                {app.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case 'file':
    case 'directory':
      control = (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await invoke('browsePath', {
                kind: field.type,
                prefName: field.name,
              });
              if (result.ok && result.result && typeof result.result === 'object') {
                const path = (result.result as { path?: unknown }).path;
                if (typeof path === 'string') {
                  onDraftChange(field.name, path);
                }
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {field.type === 'directory' ? 'Choose folder…' : 'Choose file…'}
        </Button>
      );
      break;
    case 'password':
      control = (
        <Button
          onClick={() => {
            setEditorValue(textValue);
            setEditorOpen(true);
          }}
        >
          {textValue.length > 0 ? 'Change value…' : 'Set value…'}
        </Button>
      );
      break;
    default:
      control = (
        <Button
          onClick={() => {
            setEditorValue(textValue);
            setEditorOpen(true);
          }}
        >
          Edit…
        </Button>
      );
      break;
  }

  return (
    <>
      <SettingsRow
        title={field.title + (field.required ? ' *' : '')}
        description={field.type === 'checkbox' ? field.label : null}
        control={control}
      />
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="w-[520px]">
          <DialogHeader>
            <DialogTitle>{field.title}</DialogTitle>
            {field.placeholder && <DialogDescription>{field.placeholder}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor={`pref-${field.name}`} className="sr-only">
              {field.title}
            </Label>
            <Input
              id={`pref-${field.name}`}
              className="h-10 text-sm"
              type={field.type === 'password' ? 'password' : 'text'}
              value={editorValue}
              placeholder={field.placeholder ?? undefined}
              onChange={(event) => setEditorValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onDraftChange(field.name, editorValue);
                  setEditorOpen(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button size="lg" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                onDraftChange(field.name, editorValue);
                setEditorOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
