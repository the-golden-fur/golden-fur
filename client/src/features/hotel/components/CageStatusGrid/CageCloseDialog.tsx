import { useState, type FormEvent } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type { Cage } from '../../hotel.types';
import styles from './CageStatusGrid.module.css';
import { formatClosedUntil } from './cageClosure';

const PRESET_MINUTES = [30, 60, 120, 240] as const;
const MIN_MINUTES = 5;
const MAX_MINUTES = 1440;

function presetLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return minutes === 60 ? '1 hr' : `${minutes / 60} hrs`;
}

interface CageCloseDialogProps {
  /** The cage being closed, or null when the dialog is shut. */
  cage: Cage | null;
  onClose: () => void;
  onConfirm: (minutes: number) => Promise<string | null>;
}

/**
 * Custom change (front-desk cage override): picks how long a cage is closed
 * to customers. Presets cover the common short closures; "Custom" takes any
 * whole number of minutes the server accepts (5-1440). The parent remounts
 * it (via `key`) for each cage, so `openedAt` is the moment it opened - the
 * reopen-time preview is computed from that, keeping render pure.
 */
export function CageCloseDialog({
  cage,
  onClose,
  onConfirm,
}: CageCloseDialogProps) {
  const [choice, setChoice] = useState<number | 'custom'>(30);
  const [customMinutes, setCustomMinutes] = useState('45');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const minutes = choice === 'custom' ? Number(customMinutes) : choice;
  const isValid =
    Number.isInteger(minutes) &&
    minutes >= MIN_MINUTES &&
    minutes <= MAX_MINUTES;

  function handleClose() {
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    const failure = await onConfirm(minutes);
    setIsSubmitting(false);

    if (failure) {
      setError(failure);
    } else {
      handleClose();
    }
  }

  return (
    <Modal
      isOpen={cage !== null}
      title={cage ? `Close ${cage.cage_label} to customers` : ''}
      onClose={handleClose}
      closeOnBackdropClick={false}
    >
      <form className={styles.closeForm} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.copy}>
          Customers can't pick or book this cage until it reopens. Staff can
          still use it.
        </p>

        <fieldset className={styles.durationGroup}>
          <legend className={styles.durationLegend}>Close for</legend>
          {[...PRESET_MINUTES, 'custom' as const].map((option) => (
            <label key={option} className={styles.durationOption}>
              <input
                type="radio"
                name="close-duration"
                checked={choice === option}
                onChange={() => setChoice(option)}
              />
              {option === 'custom' ? 'Custom' : presetLabel(option)}
            </label>
          ))}
        </fieldset>

        {choice === 'custom' ? (
          <label className={styles.customField}>
            <span className={styles.durationLegend}>Minutes</span>
            <input
              className={styles.customInput}
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={1}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
            />
          </label>
        ) : null}

        <p className={styles.closePreview} role="status">
          {isValid
            ? `Reopens automatically at about ${formatClosedUntil(
                new Date(openedAt + minutes * 60_000).toISOString(),
                openedAt
              )}.`
            : `Enter ${MIN_MINUTES} to ${MAX_MINUTES} minutes.`}
        </p>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.dialogActions}>
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
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? 'Closing...' : 'Close cage'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
