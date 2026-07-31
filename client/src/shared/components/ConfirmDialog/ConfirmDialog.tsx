import type { ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' is used for irreversible actions - e.g. hard-deleting an
   * archived record - and renders the confirm button in the error color. */
  tone?: 'default' | 'danger';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Generic warning/confirmation modal - the repo's only prior modal
 * precedent (SessionExpiryModal) is feature-specific, so this generalizes
 * its backdrop/role="dialog" shape into something any destructive action
 * (starting with the archive workflow's hard-delete step) can reuse.
 */
export function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="presentation" aria-label={title}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>
        <div className={styles.body}>{body}</div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              tone === 'danger' ? styles.dangerButton : styles.confirmButton
            }
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? 'Working...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
