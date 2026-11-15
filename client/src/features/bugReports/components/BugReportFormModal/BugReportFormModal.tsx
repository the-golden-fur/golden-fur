import { useState, type FormEvent } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { createBugReport } from '../../api/bugReports.api';
import type { BugReportCategory } from '../../bugReports.types';
import styles from './BugReportFormModal.module.css';

interface BugReportFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
}

/**
 * The mascot widget's "Report a bug / feature request" option. Used from
 * both the customer and staff portals (AppShell) unchanged - createBugReport
 * only ever needs an accessToken, and the server resolves whether the
 * submitter is a customer or a staff member from their own JWT, so this
 * component itself never needs to know which audience opened it.
 */
export function BugReportFormModal({
  isOpen,
  onClose,
  accessToken,
}: BugReportFormModalProps) {
  const [category, setCategory] = useState<BugReportCategory>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function reset() {
    setCategory('bug');
    setTitle('');
    setDescription('');
    setError(null);
    setMessage(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !description.trim()) {
      setError('Please fill in both the title and the description.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await createBugReport(
      { category, title: title.trim(), description: description.trim() },
      accessToken
    );

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(
        result.error ?? 'Could not submit the report. Please try again.'
      );
      return;
    }

    setTitle('');
    setDescription('');
    setMessage("Thanks! We've sent this to our development team.");
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Report a bug or request a feature"
      onClose={handleClose}
      closeOnBackdropClick={false}
    >
      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <p className={styles.copy}>
          Found something broken, or have an idea that would make Golden Fur
          better? Let us know below - our development team will follow up as
          needed.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : (
          <>
            <fieldset className={styles.categoryField}>
              <legend className={styles.fieldLabel}>What is this?</legend>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="bug-report-category"
                  value="bug"
                  checked={category === 'bug'}
                  onChange={() => setCategory('bug')}
                />
                <span>Something&apos;s broken (bug)</span>
              </label>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="bug-report-category"
                  value="feature_request"
                  checked={category === 'feature_request'}
                  onChange={() => setCategory('feature_request')}
                />
                <span>I have an idea (feature request)</span>
              </label>
            </fieldset>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Title</span>
              <input
                className={styles.input}
                type="text"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="A short summary"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Description</span>
              <textarea
                className={styles.textarea}
                value={description}
                maxLength={5000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What happened, or what would you like to see?"
                rows={5}
              />
            </label>

            {error ? (
              <p className={styles.errorBanner} role="alert">
                {error}
              </p>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
