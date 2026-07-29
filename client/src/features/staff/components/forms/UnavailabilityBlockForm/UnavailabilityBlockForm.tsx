import { useState, type FormEvent } from 'react';
import { createUnavailabilityBlock } from '../../../api/staff.api';
import { createUnavailabilityBlockValidator } from '../../../modules/validators/staff.validator';
import type { UnavailabilityBlock } from '../../../staff.types';
import styles from './UnavailabilityBlockForm.module.css';

interface UnavailabilityBlockFormProps {
  /** Target staff member; defaults to the logged-in user for self-service use. */
  staffId: string;
  accessToken: string;
  onCreated: (block: UnavailabilityBlock) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UnavailabilityBlockForm({
  staffId,
  accessToken,
  onCreated,
}: UnavailabilityBlockFormProps) {
  const [isFullDay, setIsFullDay] = useState(false);
  const [fullDayDate, setFullDayDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitBlock = async (payload: {
    quick_action?: boolean;
    is_full_day?: boolean;
    date?: string;
    start_time?: string;
    end_time?: string;
    reason?: string;
  }) => {
    setError(null);
    setIsSubmitting(true);
    const result = await createUnavailabilityBlock(
      staffId,
      accessToken,
      payload
    );
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not create the day-off request.');
      return;
    }

    setStartTime('');
    setEndTime('');
    setReason('');
    onCreated(result.data);
  };

  const handleQuickAction = () => {
    void submitBlock({ quick_action: true });
  };

  const handleCustomRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedReason = reason.trim();

    if (isFullDay) {
      const parsed = createUnavailabilityBlockValidator.safeParse({
        is_full_day: true,
        date: fullDayDate,
        reason: trimmedReason ? trimmedReason : undefined,
      });

      if (!parsed.success) {
        setError(
          parsed.error.issues[0]?.message ?? 'Check the selected date.'
        );
        return;
      }

      void submitBlock({
        is_full_day: true,
        date: parsed.data.date,
        reason: parsed.data.reason,
      });
      return;
    }

    const parsed = createUnavailabilityBlockValidator.safeParse({
      start_time: startTime,
      end_time: endTime,
      reason: trimmedReason ? trimmedReason : undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the selected times.');
      return;
    }

    void submitBlock({
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      reason: parsed.data.reason,
    });
  };

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.quickButton}
        disabled={isSubmitting}
        onClick={handleQuickAction}
      >
        Take the rest of today off
      </button>

      <form
        className={styles.form}
        onSubmit={(event) => void handleCustomRange(event)}
      >
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={isFullDay}
            onChange={(event) => setIsFullDay(event.target.checked)}
          />
          <span>Entire day</span>
        </label>

        {isFullDay ? (
          <label className={styles.field}>
            <span className={styles.label}>Date</span>
            <input
              className={styles.input}
              type="date"
              value={fullDayDate}
              onChange={(event) => setFullDayDate(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Start</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>End</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </label>
          </>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Reason (internal only)</span>
          <input
            className={styles.input}
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Requesting...' : 'Request day(s) off'}
        </button>
      </form>
    </div>
  );
}
