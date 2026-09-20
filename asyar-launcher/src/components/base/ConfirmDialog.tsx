import React from 'react';
import Modal from './Modal';
import { Button } from '../react/Buttons';

export interface ConfirmDialogProps {
  title?: string;
  message?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  isOpen?: boolean;
  onconfirm?: () => void;
  oncancel?: () => void;
  variant?: 'default' | 'danger';
}

export default function ConfirmDialog({
  title = 'Confirm Action',
  message = 'Are you sure you want to continue?',
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  isOpen = false,
  onconfirm,
  oncancel,
  variant = 'default',
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      labelledBy="confirm-dialog-title"
      onEscape={oncancel}
      onEnter={onconfirm}
      actions={
        <>
          <Button onClick={oncancel}>{cancelButtonText}</Button>
          <Button
            autoFocus
            onClick={onconfirm}
            className={
              variant === 'danger'
                ? '!bg-[var(--accent-danger-fill)] !text-[var(--text-on-accent)] !border-none hover:opacity-90'
                : ''
            }
          >
            {confirmButtonText}
          </Button>
        </>
      }
    >
      <h2
        id="confirm-dialog-title"
        className="text-xl font-semibold mb-4 text-[var(--text-primary)] flex items-center"
      >
        {variant === 'danger' ? <span className="mr-2">⚠️</span> : null}
        {title}
      </h2>
      <p className="text-[var(--text-secondary)] text-sm">{message}</p>
    </Modal>
  );
}
