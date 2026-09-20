import React, { useState, useRef, useCallback } from 'react';

export interface SplitViewProps {
  leftWidth?: string | number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export default function SplitView({
  leftWidth = '33.333%',
  minLeftWidth = 200,
  maxLeftWidth = 800,
  left,
  right,
}: SplitViewProps) {
  const [currentWidth, setCurrentWidth] = useState<string | number>(leftWidth);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      const startX = event.pageX;
      const startWidth = leftPanelRef.current?.offsetWidth ?? 200;

      const handleResize = (e: MouseEvent) => {
        const diff = e.pageX - startX;
        const newWidth = Math.min(Math.max(startWidth + diff, minLeftWidth), maxLeftWidth);
        setCurrentWidth(`${newWidth}px`);
      };

      const stopResize = () => {
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', stopResize);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    },
    [minLeftWidth, maxLeftWidth],
  );

  return (
    <div className="split-view flex-1 flex h-full overflow-hidden">
      <div className="split-view-content isolate contain-strict flex w-full h-full">
        <div
          ref={leftPanelRef}
          className="split-view-left custom-scrollbar h-full overflow-y-auto shrink-0"
          style={{ width: typeof currentWidth === 'number' ? `${currentWidth}px` : currentWidth }}
        >
          {left}
        </div>

        <div
          className="split-view-handle w-[1px] cursor-ew-resize bg-[var(--border-color)] hover:bg-[var(--accent-primary)] transition-colors shrink-0"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startResize}
        />

        <div className="split-view-right flex-1 h-full overflow-hidden">{right}</div>
      </div>
    </div>
  );
}
