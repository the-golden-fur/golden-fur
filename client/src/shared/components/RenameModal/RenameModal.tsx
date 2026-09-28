import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../Modal/Modal';
import styles from './RenameModal.module.css';

interface RenameModalProps {
  isOpen: boolean;
  /** Singular, lower-case noun shown in the title/label, e.g. "cage" or
   * "pet type". */
  entityLabel: string;
  currentName: string;
  /** Resolves to an error message to show inline, or null on success (the
   * modal then closes itself). */
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}

interface RenameFormProps {
  entityLabel: string;
  currentName: string;
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}

function RenameForm({
  entityLabel,
  currentName,
  onSubmit,
  onClose,
}: RenameFormProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const isUnchanged = trimmed === currentName.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmed) {
      setError('Name is required.');
      return;
    }

    if (isUnchanged || isSaving) return;

    setIsSaving(true);
    setError(null);

    const submitError = await onSubmit(trimmed);

    setIsSaving(false);

    if (submitError) {
      setError(submitError);
      return;
    }

    onClose();
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={`New ${entityLabel} name`}
          aria-invalid={error ? true : undefined}
          disabled={isSaving}
        />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.saveButton}
          disabled={isSaving || !trimmed || isUnchanged}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/**
 * Shared "Rename" pop-up for the admin Config "..." menus (Configure /
 * Rename / Archive) - one text box, Save, Cancel. Modal renders nothing while
 * closed, so RenameForm (and its draft text/error) is freshly mounted from
 * currentName on every open.
 */
export function RenameModal({
  isOpen,
  entityLabel,
  currentName,
  onSubmit,
  onClose,
}: RenameModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      title={`Rename ${entityLabel}`}
      onClose={onClose}
      closeOnBackdropClick={false}
    >
      <RenameForm
        entityLabel={entityLabel}
        currentName={currentName}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}
