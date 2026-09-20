import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icon } from '../react/Icon';
import { IconButton } from '../react/Interactive';

/**
 * Custom title bar for the frameless settings window. The bar itself is the
 * drag region; close goes through the Rust CloseRequested handler, which
 * hides the window instead of destroying it — the same behaviour the native
 * button had. Deliberately chrome-free: the sidebar below carries the
 * identity, this strip only exists to drag and host the window controls.
 */
export default function SettingsTitleBar() {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    win
      .isMaximized()
      .then(setMaximized)
      .catch(() => {});
    win
      .onResized(() => {
        win
          .isMaximized()
          .then(setMaximized)
          .catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-end h-[var(--size-xl)] shrink-0 select-none"
    >
      <IconButton
        ariaLabel="Minimize window"
        title="Minimize"
        size="md"
        className="window-control"
        onClick={() => void win.minimize()}
      >
        <Icon name="minus" size={16} />
      </IconButton>
      <IconButton
        ariaLabel={maximized ? 'Restore window size' : 'Maximize window'}
        title={maximized ? 'Restore' : 'Maximize'}
        size="md"
        className="window-control"
        onClick={() => void win.toggleMaximize()}
      >
        <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
      </IconButton>
      <IconButton
        ariaLabel="Close window"
        title="Close"
        size="md"
        className="window-control window-control-close"
        onClick={() => void win.close()}
      >
        <Icon name="close" size={16} />
      </IconButton>
    </div>
  );
}
