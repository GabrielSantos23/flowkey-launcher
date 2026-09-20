import React, { useEffect, useState, useRef } from 'react';
import FormField from '../../components/form/FormField';
import { Input } from '../../components/base/TextControls';
import PlaceholderPicker from '../../components/form/PlaceholderPicker';
import type { Portal } from './portalStore';
import { fetchPlaceholders } from '../../lib/placeholders/placeholderResolver';

import { Button } from '../../components/react/Buttons';

export interface PortalFormProps {
  portal?: Partial<Portal>;
  isEditing?: boolean;
  onsave?: (portal: Portal) => void;
  oncancel?: () => void;
}

export default function PortalForm({
  portal = {},
  isEditing = false,
  onsave,
  oncancel,
}: PortalFormProps) {
  const [name, setName] = useState(portal.name ?? '');
  const [url, setUrl] = useState(portal.url ?? '');
  const [icon, setIcon] = useState(portal.icon ?? '🌐');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [triggerCursorPos, setTriggerCursorPos] = useState(-1);
  const [tokenList, setTokenList] = useState('');

  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(portal.name ?? '');
    setUrl(portal.url ?? '');
    setIcon(portal.icon ?? '🌐');
  }, [portal]);

  useEffect(() => {
    fetchPlaceholders().then((placeholders) => {
      setTokenList(placeholders.map((p) => `{${p.token}}`).join(', '));
    });
  }, []);

  const handleSave = () => {
    if (!name.trim() || !url.trim()) return;
    onsave?.({
      id: portal.id ?? crypto.randomUUID(),
      name: name.trim(),
      url: url.trim(),
      icon: icon.trim() || '🌐',
      createdAt: portal.createdAt ?? Date.now(),
    });
  };

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (pickerOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        oncancel?.();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [pickerOpen, name, url, icon]);

  const handleUrlInput = (val: string) => {
    setUrl(val);
    const input = urlInputRef.current;
    if (!input) return;
    const cursorPos = input.selectionStart ?? val.length;
    const charBefore = val[cursorPos - 1];
    if (charBefore === '{') {
      setTriggerCursorPos(cursorPos);
      setPickerOpen(true);
    }
  };

  const openPickerViaButton = () => {
    setTriggerCursorPos(-1);
    setPickerOpen(true);
    urlInputRef.current?.focus();
  };

  const handleInsert = (token: string) => {
    if (!urlInputRef.current) return;
    urlInputRef.current.focus();

    if (triggerCursorPos > 0) {
      const replaceStart = triggerCursorPos - 1;
      const replaceEnd = triggerCursorPos;
      urlInputRef.current.setRangeText('{' + token + '}', replaceStart, replaceEnd, 'end');
    } else {
      const start = urlInputRef.current.selectionStart ?? urlInputRef.current.value.length;
      const end = urlInputRef.current.selectionEnd ?? urlInputRef.current.value.length;
      urlInputRef.current.setRangeText('{' + token + '}', start, end, 'end');
    }

    setUrl(urlInputRef.current.value);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setTriggerCursorPos(-1);
    urlInputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4 bg-[var(--bg-secondary)] rounded-[var(--radius-md)] border border-[var(--border-color)] p-4">
      <FormField label={'Name'} id="portal-name">
        <Input
          id="portal-name"
          value={name}
          onChange={setName}
          placeholder={'Search Google'}
          autoFocus
        />
      </FormField>

      <div className="relative">
        <FormField label="URL" id="portal-url">
          <div className="flex gap-2 items-center">
            <div className="flex-1 min-w-0">
              <Input
                id="portal-url"
                ref={urlInputRef}
                value={url}
                onChange={handleUrlInput}
                placeholder="https://google.com/search?q={query}"
              />
            </div>
            <button
              className="h-8 px-3 font-mono text-sm shrink-0 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-[var(--radius-md)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)]"
              type="button"
              title="Insert placeholder"
              onClick={openPickerViaButton}
            >
              {'{ }'}
            </button>
          </div>
        </FormField>

        {pickerOpen && <PlaceholderPicker onInsert={handleInsert} onClose={closePicker} />}
      </div>

      <FormField label={'Icon'} id="portal-icon">
        <Input id="portal-icon" value={icon} onChange={setIcon} placeholder="🌐" maxLength={4} />
      </FormField>

      <p className="text-xs text-[var(--text-secondary)] m-0 leading-relaxed">
        Use placeholders in the URL: {tokenList}.<br />
        Press <code className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded font-mono">
          {'{'}
        </code>{' '}
        or the <strong>{'{ }'}</strong> button to browse all placeholders.
      </p>

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={oncancel}>{'Cancel'}</Button>
        <Button variant="primary" onClick={handleSave} disabled={!name.trim() || !url.trim()}>
          {isEditing ? 'Update' : 'Save'} <span className="text-xs ml-1 opacity-70">Ctrl+S</span>
        </Button>
      </div>
    </div>
  );
}
