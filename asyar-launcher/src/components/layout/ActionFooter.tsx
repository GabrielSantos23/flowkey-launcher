import React from 'react';

export interface ActionFooterProps {
  children?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export default function ActionFooter({ children, left, right }: ActionFooterProps) {
  if (children === undefined && left === undefined && right === undefined) {
    return null;
  }

  return (
    <div
      className="action-footer w-full shrink-0 border-t border-[var(--border-color)] flex items-center justify-between px-4"
      style={{
        height: 'var(--shell-footer-h)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {left !== undefined || right !== undefined ? (
        <>
          <div className="flex items-center gap-2">{left}</div>
          <div className="flex items-center gap-2">{right}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
