import { useId, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Generic titled overlay modal - same backdrop/header/close-button shape as
 * ComposeModal (the repo's prior precedent for a form-carrying modal, as
 * opposed to ConfirmDialog's fixed confirm/cancel shape). Used by the
 * Services/Service Types/Packages admin pages so an edit form opens over the
 * list instead of pushing it down.
 */
export function Modal({ isOpen, title, onClose, children }: ModalProps) {
  const titleId = useId();

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
