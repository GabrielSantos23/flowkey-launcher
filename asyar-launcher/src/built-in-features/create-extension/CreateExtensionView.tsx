import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { generateExtension, type ExtensionType } from './scaffoldService';
import { logService } from '../../services/log/logService';
import FormField from '../../components/form/FormField';
import { Input } from '../../components/base/TextControls';
import { Button } from '../../components/react/Buttons';
import { setFocusLock } from '../../lib/ipc/commands';

export default function CreateExtensionView() {
  const [extType, setExtType] = useState<ExtensionType>('view');
  const [extName, setExtName] = useState('');
  const [extId, setExtId] = useState('');
  const [extDesc, setExtDesc] = useState('');
  const [saveLocation, setSaveLocation] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState('');

  const finalSaveLocation = saveLocation && extId ? `${saveLocation}/${extId}` : '';

  const typeOptions: { value: ExtensionType; label: string; icon: string; description: string }[] =
    [
      {
        value: 'view',
        icon: '🖼️',
        label: 'UI View',
        description: 'Full-page Svelte interface opened directly by a command.',
      },
      {
        value: 'result',
        icon: '🔍',
        label: 'Search + View',
        description: 'Returns filterable results; clicking one opens a detail view.',
      },
      {
        value: 'logic',
        icon: '⚡',
        label: 'Action Only',
        description: 'Runs logic directly with no UI — appears in search as actionable items.',
      },
      {
        value: 'theme',
        icon: '🎨',
        label: 'Theme',
        description: "Customizes Flowkey's appearance with CSS variables. No JavaScript required.",
      },
    ];

  const handleBrowse = async () => {
    setIsBrowsing(true);
    try {
      await setFocusLock(true);
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select Extension Save Location',
      });
      if (selectedPath && typeof selectedPath === 'string') {
        setSaveLocation(selectedPath);
      }
    } catch (e) {
      logService.error(`Dialog error: ${e}`);
    } finally {
      await setFocusLock(false);
      setIsBrowsing(false);
    }
  };

  const handleCreate = async () => {
    if (!extName || !extId || !saveLocation) return;

    setIsGenerating(true);
    setGenerateStatus('Initializing scaffold...');

    try {
      await generateExtension({
        name: extName,
        id: extId,
        description: extDesc || 'An Flowkey extension.',
        location: finalSaveLocation,
        extensionType: extType,
        onProgress: (status) => {
          setGenerateStatus(status);
        },
      });

      setTimeout(() => {
        setIsGenerating(false);
        setGenerateStatus('Generated successfully!');
      }, 1500);

      try {
        const { ExtensionManagerProxy } = await import('asyar-sdk/contracts');
        await new ExtensionManagerProxy().reloadExtensions();
      } catch (err) {
        logService.error(`Failed to trigger reload: ${err}`);
      }
    } catch (e: any) {
      setGenerateStatus(`Error: ${e.message || String(e)}`);
      setIsGenerating(false);
    }
  };

  const idError =
    extId && !/^[a-z][a-z0-9\-]*(\.[a-z][a-z0-9\-]*)+$/.test(extId)
      ? 'Must use dot-notation format (e.g., com.author.my-tool)'
      : '';
  const nameError =
    extName && (extName.length < 2 || extName.length > 50)
      ? 'Must be between 2 and 50 characters'
      : '';
  const descError =
    extDesc && (extDesc.length < 10 || extDesc.length > 200)
      ? 'Must be between 10 and 200 characters'
      : '';

  const isValidForm =
    !idError &&
    !nameError &&
    !descError &&
    extName &&
    extId &&
    finalSaveLocation &&
    (!extDesc || extDesc.length >= 10);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{'Create Extension'}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {'Scaffold a new Flowkey extension project automatically.'}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <FormField label={'Extension Type'}>
            <div className="grid grid-cols-2 gap-3">
              {typeOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-4 p-4 rounded-[var(--radius-md)] border-2 cursor-pointer transition-colors ${
                    extType === opt.value
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-hover)]'
                      : 'border-[var(--border-color)] hover:border-[var(--accent-primary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="ext-type"
                    value={opt.value}
                    checked={extType === opt.value}
                    onChange={() => setExtType(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-xl">{opt.icon}</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {opt.label}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">{opt.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </FormField>

          <FormField label={'Extension Name'} error={nameError}>
            <Input value={extName} onChange={setExtName} placeholder={'My Awesome Tool'} />
          </FormField>

          <FormField
            label={'Extension ID'}
            hint={'Unique dot-notation identifier — e.g. com.author.my-tool'}
            error={idError}
          >
            <Input
              value={extId}
              onChange={setExtId}
              placeholder="com.myname.awesome-tool"
              className="font-mono"
            />
          </FormField>

          <FormField
            label={'Description'}
            hint={'Optional — shown in search results (10–200 chars)'}
            error={descError}
          >
            <Input
              value={extDesc}
              onChange={setExtDesc}
              placeholder={'What does your extension do?'}
            />
          </FormField>

          <FormField label={'Save Location'}>
            <div className="flex gap-3">
              <Input
                value={finalSaveLocation || saveLocation}
                readOnly
                placeholder={'Select a parent folder...'}
                className="font-mono flex-1 opacity-75 cursor-not-allowed"
              />
              <Button onClick={() => void handleBrowse()} disabled={isBrowsing}>
                {'Browse…'}
              </Button>
            </div>
          </FormField>
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 h-14 border-t border-[var(--separator)] bg-[var(--bg-secondary)] shrink-0">
        <span className="text-sm text-[var(--text-tertiary)]">
          {isGenerating ? <span className="animate-pulse">{generateStatus}</span> : generateStatus}
        </span>
        <Button
          variant="primary"
          onClick={() => void handleCreate()}
          disabled={!isValidForm || isGenerating}
        >
          {isGenerating ? 'Creating…' : 'Create Scaffold'}
        </Button>
      </footer>
    </div>
  );
}
