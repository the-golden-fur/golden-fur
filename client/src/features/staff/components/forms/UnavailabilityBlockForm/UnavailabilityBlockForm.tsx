import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createUnavailabilityBlock, listStaff } from '../../../api/staff.api';
import { createUnavailabilityBlockValidator } from '../../../modules/validators/staff.validator';
import type {
  StaffProfile,
  StaffRole,
  UnavailabilityBlock,
} from '../../../staff.types';
import styles from './UnavailabilityBlockForm.module.css';

/** Mirrors the server's UNAVAILABILITY_MANAGER_ROLES (staff.types.ts) - who
 * a request can be meaningfully addressed to. */
const REVIEWER_ROLES: StaffRole[] = ['Admin', 'Supervisor', 'Superadmin'];

/** Common start/end times for a day off - saves typing/scrolling a native
 * datetime picker for the times people actually pick, mirroring the
 * quick-pick convenience of the booking flow's TimeSlotInput. */
const QUICK_TIMES: Array<{ label: string; hhmm: string }> = [
  { label: '8:00 AM', hhmm: '08:00' },
  { label: '9:00 AM', hhmm: '09:00' },
  { label: '12:00 PM', hhmm: '12:00' },
  { label: '1:00 PM', hhmm: '13:00' },
  { label: '5:00 PM', hhmm: '17:00' },
  { label: '6:00 PM', hhmm: '18:00' },
];

interface UnavailabilityBlockFormProps {
  /** Target staff member; defaults to the logged-in user for self-service use. */
  staffId: string;
  accessToken: string;
  onCreated: (block: UnavailabilityBlock) => void;
  /** Shows a "Send to" reviewer picker - only meaningful for self-service
   * requests, which enter the pending review queue. On-behalf-of creation
   * (e.g. StaffManagementPage, admin acting for another staff member)
   * auto-approves immediately, so there's no reviewer to address it to;
   * that call site leaves this false (default). */
  showReviewerPicker?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keeps the date portion of a datetime-local value (or defaults to today)
 * and swaps in a quick-pick time. */
function applyQuickTime(current: string, hhmm: string): string {
  const datePart = current.slice(0, 10) || todayIso();
  return `${datePart}T${hhmm}`;
}

export function UnavailabilityBlockForm({
  staffId,
  accessToken,
  onCreated,
  showReviewerPicker = false,
}: UnavailabilityBlockFormProps) {
  const [isFullDay, setIsFullDay] = useState(false);
  const [fullDayDate, setFullDayDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reviewers, setReviewers] = useState<StaffProfile[]>([]);
  const [requestedReviewerId, setRequestedReviewerId] = useState('');

  useEffect(() => {
    if (!showReviewerPicker) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (isMounted && result.data) {
        setReviewers(
          result.data.filter(
            (candidate) =>
              REVIEWER_ROLES.includes(candidate.role) &&
              candidate.id !== staffId
          )
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [showReviewerPicker, accessToken, staffId]);

  // Alphabetical - no sort/filter controls exposed, just a predictable
  // default order for the plain <select> below.
  const sortedReviewers = useMemo(
    () =>
      [...reviewers].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      ),
    [reviewers]
  );

  const submitBlock = async (payload: {
    quick_action?: boolean;
    is_full_day?: boolean;
    date?: string;
    start_time?: string;
    end_time?: string;
    reason?: string;
    requested_reviewer_id?: string;
  }) => {
    setError(null);
    setIsSubmitting(true);
    const result = await createUnavailabilityBlock(
      staffId,
      accessToken,
      requestedReviewerId
        ? { ...payload, requested_reviewer_id: requestedReviewerId }
        : payload
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
        setError(parsed.error.issues[0]?.message ?? 'Check the selected date.');
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
      {showReviewerPicker && reviewers.length > 0 ? (
        <label className={styles.reviewerPicker}>
          <span className={styles.label}>Send to (optional)</span>
          <select
            className={styles.input}
            value={requestedReviewerId}
            onChange={(event) => setRequestedReviewerId(event.target.value)}
            aria-label="Send to"
          >
            <option value="">Any manager</option>
            {sortedReviewers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.display_name} - {candidate.role}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
              min={todayIso()}
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
              <div className={styles.quickTimes}>
                {QUICK_TIMES.map(({ label, hhmm }) => (
                  <button
                    key={`start-${hhmm}`}
                    type="button"
                    className={styles.quickTimeButton}
                    onClick={() =>
                      setStartTime((current) => applyQuickTime(current, hhmm))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>End</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
              <div className={styles.quickTimes}>
                {QUICK_TIMES.map(({ label, hhmm }) => (
                  <button
                    key={`end-${hhmm}`}
                    type="button"
                    className={styles.quickTimeButton}
                    onClick={() =>
                      setEndTime((current) => applyQuickTime(current, hhmm))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
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
