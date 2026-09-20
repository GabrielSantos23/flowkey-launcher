import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  isOpen?: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onEscape?: () => void;
  onEnter?: () => void;
  onClose?: () => void;
  onConfirm?: () => void;
  labelledBy?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function Modal({
  isOpen = true,
  title,
  subtitle,
  onEscape,
  onEnter,
  onClose,
  onConfirm,
  labelledBy,
  children,
  actions,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const handleClose = onClose ?? onEscape;
  const handleConfirm = onConfirm ?? onEnter;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose?.();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const active = document.activeElement;
        if (active?.tagName === 'TEXTAREA') return;
        if (active?.tagName === 'BUTTON' && active !== modalRef.current) return;
        e.preventDefault();
        handleConfirm?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handleConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        ref={modalRef}
        className="modal-surface w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--bg-popup)] border border-[var(--border-color)] shadow-2xl p-6 flex flex-col gap-4 text-[var(--text-primary)]"
      >
        {title ? (
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {subtitle ? <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p> : null}
          </div>
        ) : null}
        <div className="modal-body flex-1">{children}</div>
        {actions ? (
          <div className="modal-actions flex items-center justify-end gap-3 pt-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
