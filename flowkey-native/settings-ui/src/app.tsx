import { useCallback, useState, type ReactNode } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  KeyboardIcon,
  MinusIcon,
  PuzzleIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { invoke, useSettingsState } from '@/bridge';
import { cn } from '@/lib/utils';
import { ExtensionIcon } from '@/components/extension-icon';
import { HotkeyRecorder } from '@/components/hotkey-recorder';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { ConsentDialogs } from '@/components/consent-dialog';
import { GeneralPage } from '@/pages/general';
import { ExtensionsPage } from '@/pages/extensions';
import { ExtensionDetailPage } from '@/pages/extension-detail';
import { AboutPage } from '@/pages/about';
import type { SettingsNavItem } from '@/types';

/**
 * The settings window, fully web-drawn: a chrome bar (drag band via
 * app-region: drag, back/forward + window buttons), a sidebar with the shell
 * computed nav, and the routed page. State is the shell's pushed snapshot;
 * navigation history (back/forward) is the page's own, mirroring the former
 * SettingsWindow chrome.
 */
export function App() {
  const state = useSettingsState();
  const [nav, setNav] = useState<{ stack: string[]; index: number }>({
    stack: ['general'],
    index: 0,
  });
  const current = nav.stack[nav.index] ?? 'general';

  const navigate = useCallback((key: string) => {
    setNav(({ stack, index }) =>
      stack[index] === key
        ? { stack, index }
        : { stack: [...stack.slice(0, index + 1), key], index: index + 1 },
    );
  }, []);
  const goBack = useCallback(() => {
    setNav(({ stack, index }) => (index > 0 ? { stack, index: index - 1 } : { stack, index }));
  }, []);
  const goForward = useCallback(() => {
    setNav(({ stack, index }) =>
      index < stack.length - 1 ? { stack, index: index + 1 } : { stack, index },
    );
  }, []);

  if (!state) {
    // the host page shows a "Loading settings…" placeholder until the first push
    return <div className="h-full" />;
  }

  return (
    <ErrorBoundary>
      <div className="flex h-full flex-col">
        <ChromeBar
          canBack={nav.index > 0}
          canForward={nav.index < nav.stack.length - 1}
          onBack={goBack}
          onForward={goForward}
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar nav={state.nav} current={current} onNavigate={navigate} />
          <main className="min-h-0 flex-1 overflow-y-auto px-6 py-4.5 [scroll-behavior:smooth]">
            {current === 'general' && <GeneralPage state={state} />}
            {current === 'extensions' && <ExtensionsPage state={state} />}
            {current === 'about' && <AboutPage state={state} />}
            {current.startsWith('ext:') && (
              <ExtensionDetailPage state={state} extensionId={current.slice(4)} />
            )}
          </main>
        </div>
        <HotkeyRecorder />
        <ConsentDialogs />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

function ChromeBar({
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <div className="app-region-drag flex h-10 flex-none items-center bg-chrome border-b border-chrome-divider">
      <span className="ml-3 text-xs text-text-secondary">Settings</span>
      <div className="app-region-no-drag flex items-center gap-1 ml-6">
        <ChromeButton disabled={!canBack} onClick={onBack} title="Back">
          <ChevronLeftIcon className="size-4" />
        </ChromeButton>
        <ChromeButton disabled={!canForward} onClick={onForward} title="Forward">
          <ChevronRightIcon className="size-4" />
        </ChromeButton>
      </div>
      <div className="flex-1" />
      <div className="app-region-no-drag flex items-center">
        <ChromeButton
          onClick={() => void invokeWindow('window.minimize')}
          title="Minimize"
          className="w-[46px]"
        >
          <MinusIcon className="size-4" />
        </ChromeButton>
        <ChromeButton
          onClick={() => void invokeWindow('window.close')}
          title="Close"
          className="w-[46px]"
        >
          <XIcon className="size-4" />
        </ChromeButton>
      </div>
    </div>
  );
}

async function invokeWindow(op: string) {
  await invoke(op);
}

function ChromeButton({
  children,
  disabled,
  onClick,
  title,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-[26px] items-center justify-center rounded-[5px] text-text-secondary hover:bg-card hover:text-foreground disabled:text-chrome-nav-disabled disabled:hover:bg-transparent cursor-pointer',
        'px-1.5',
        className,
      )}
    >
      {children}
    </button>
  );
}

const STATIC_NAV_ICONS: Record<string, ReactNode> = {
  general: <SettingsIcon className="size-3" />,
  shortcuts: <KeyboardIcon className="size-3" />,
  extensions: <PuzzleIcon className="size-3" />,
  about: <InfoIcon className="size-3" />,
};

function Sidebar({
  nav,
  current,
  onNavigate,
}: {
  nav: SettingsNavItem[];
  current: string;
  onNavigate: (key: string) => void;
}) {
  const firstExtensionKey = nav.find((item) => item.key.startsWith('ext:'))?.key;
  return (
    <aside className="w-[230px] flex-none border-r border-border p-3 overflow-y-auto [scroll-behavior:smooth]">
      <div
        className="rounded-md bg-card border border-keycap-border px-2.5 h-8 flex items-center gap-2 mb-2 opacity-70"
        title="Not available yet"
      >
        <SettingsIcon className="size-3.5 text-text-tertiary" />
        <span className="text-xs text-text-tertiary">Search settings…</span>
      </div>
      <div className="flex flex-col gap-1">
        {nav.map((item) => (
          <NavItemView
            key={item.key}
            item={item}
            active={item.key === current}
            groupGap={item.key === firstExtensionKey || item.key === 'about'}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </aside>
  );
}

function NavItemView({
  item,
  active,
  groupGap,
  onNavigate,
}: {
  item: SettingsNavItem;
  active: boolean;
  groupGap: boolean;
  onNavigate: (key: string) => void;
}) {
  const icon = item.icon ? (
    <ExtensionIcon icon={item.icon} className="size-5" />
  ) : (
    <span className="flex size-5 items-center justify-center rounded-[4px] border border-keycap-border text-text-secondary">
      {STATIC_NAV_ICONS[item.key] ?? null}
    </span>
  );
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors cursor-pointer',
        active ? 'bg-accent' : 'hover:bg-card',
        groupGap && 'mt-3',
      )}
    >
      {icon}
      <span className="truncate">{item.label}</span>
    </button>
  );
}
