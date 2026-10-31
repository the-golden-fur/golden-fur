import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createUnavailabilityBlock,
  listStaff,
  updateUnavailabilityBlock,
} from '../../../api/staff.api';
import { createUnavailabilityBlockValidator } from '../../../modules/validators/staff.validator';
import {
  SELF_SERVICE_LEAVE_TYPES,
  type StaffProfile,
  type StaffRole,
  type UnavailabilityBlock,
  type UnavailabilityLeaveType,
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
  /** Edit mode (Day Off Requests' "Edit request"): prefills from this
   * still-pending request and saves over it instead of creating a new one.
   * onCreated then receives the updated row. */
  editingBlock?: UnavailabilityBlock;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tomorrow as a browser-local YYYY-MM-DD - the earliest date a staff
 * member may request an entire day off for themselves (today is already
 * under way; the server enforces the same rule branch-locally). */
function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ISO timestamp -> the browser-local 'YYYY-MM-DDTHH:mm' a datetime-local
 * input expects. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  editingBlock,
}: UnavailabilityBlockFormProps) {
  // Self-service requests (the reviewer picker is only shown for those) can't
  // take today off as an entire day; a manager setting a day for someone
  // else still can.
  const earliestFullDay = showReviewerPicker ? tomorrowIso() : todayIso();
  const [isFullDay, setIsFullDay] = useState(
    editingBlock?.is_full_day ?? false
  );
  const [fullDayDate, setFullDayDate] = useState(() =>
    editingBlock?.is_full_day
      ? toLocalInput(editingBlock.start_time).slice(0, 10)
      : showReviewerPicker
        ? tomorrowIso()
        : todayIso()
  );
  const [startTime, setStartTime] = useState(() =>
    editingBlock && !editingBlock.is_full_day
      ? toLocalInput(editingBlock.start_time)
      : ''
  );
  const [endTime, setEndTime] = useState(() =>
    editingBlock && !editingBlock.is_full_day
      ? toLocalInput(editingBlock.end_time)
      : ''
  );
  const [reason, setReason] = useState(editingBlock?.reason ?? '');
  const [leaveType, setLeaveType] = useState<UnavailabilityLeaveType>(
    editingBlock && SELF_SERVICE_LEAVE_TYPES.includes(editingBlock.leave_type)
      ? editingBlock.leave_type
      : 'Vacation Leave'
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reviewers, setReviewers] = useState<StaffProfile[]>([]);
  const [requestedReviewerId, setRequestedReviewerId] = useState(
    editingBlock?.requested_reviewer_id ?? ''
  );

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
    is_full_day?: boolean;
    date?: string;
    start_time?: string;
    end_time?: string;
    reason?: string;
    requested_reviewer_id?: string;
    leave_type?: UnavailabilityLeaveType;
  }) => {
    setError(null);
    setIsSubmitting(true);
    const body = requestedReviewerId
      ? { ...payload, requested_reviewer_id: requestedReviewerId }
      : payload;
    const result = editingBlock
      ? await updateUnavailabilityBlock(
          staffId,
          accessToken,
          editingBlock.id,
          body
        )
      : await createUnavailabilityBlock(staffId, accessToken, body);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(
        result.error ??
          (editingBlock
            ? 'Could not save the day-off request.'
            : 'Could not create the day-off request.')
      );
      return;
    }

    setStartTime('');
    setEndTime('');
    setReason('');
    onCreated(result.data);
  };

  const handleCustomRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedReason = reason.trim();

    if (isFullDay && fullDayDate < earliestFullDay) {
      setError(
        "You can't request today off as an entire day - pick a later date."
      );
      return;
    }

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
        leave_type: leaveType,
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
      leave_type: leaveType,
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
            <option value="">Any manager (picked at random)</option>
            {sortedReviewers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.display_name} - {candidate.role}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => void handleCustomRange(event)}
      >
        <label className={styles.field}>
          <span className={styles.label}>Type</span>
          <select
            className={styles.input}
            value={leaveType}
            onChange={(event) =>
              setLeaveType(event.target.value as UnavailabilityLeaveType)
            }
          >
            {SELF_SERVICE_LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

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
              min={earliestFullDay}
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
          {editingBlock
            ? isSubmitting
              ? 'Saving...'
              : 'Save changes'
            : isSubmitting
              ? 'Requesting...'
              : 'Request day(s) off'}
        </button>
      </form>
    </div>
  );
}
