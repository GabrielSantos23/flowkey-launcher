import { useEffect, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getSnapGuideState, type SnapGuideState } from '../lib/ipc/commands';
import './snapGuides.css';

export default function SnapGuidesPage() {
  const [leftX, setLeftX] = useState(0);
  const [rightX, setRightX] = useState(0);
  const [y, setY] = useState(0);
  const [snappedX, setSnappedX] = useState(false);
  const [snappedY, setSnappedY] = useState(false);

  const applyState = (state: SnapGuideState) => {
    setLeftX(state.leftX);
    setRightX(state.rightX);
    setY(state.y);
    setSnappedX(state.snappedX);
    setSnappedY(state.snappedY);
  };

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    getSnapGuideState()
      .then((initial) => {
        if (!disposed && initial) applyState(initial);
      })
      .catch((err) => console.error('[snap-guides] get_snap_guide_state failed:', err));

    listen<SnapGuideState>('snap-guides:state', (event) => {
      applyState(event.payload);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.error('[snap-guides] listen snap-guides:state failed:', err));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <>
      <div
        className={`guide-line guide-line--vertical ${snappedX ? 'guide-line--active' : ''}`}
        style={{ left: `${leftX}px` }}
      />
      <div
        className={`guide-line guide-line--vertical ${snappedX ? 'guide-line--active' : ''}`}
        style={{ left: `${rightX}px` }}
      />
      <div
        className={`guide-line guide-line--horizontal ${snappedY ? 'guide-line--active' : ''}`}
        style={{ top: `${y}px` }}
      />
    </>
  );
}
