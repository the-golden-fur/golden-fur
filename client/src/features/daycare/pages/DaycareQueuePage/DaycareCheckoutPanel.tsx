import { useState } from 'react';
import { checkOutDaycareSession } from '../../api/daycare.api';
import type { DaycareSession } from '../../daycare.types';
import styles from './DaycareCheckoutPanel.module.css';

interface DaycareCheckoutPanelProps {
  accessToken: string;
  /** Daycare Queue redesign: this panel used to also offer its own
   * DaycareSessionPicker (a bare "choose which session to check out"
   * screen) for whenever it was reached without a session already known.
   * Its only remaining caller (BoardingChecklistPage's per-pet view) always
   * already knows which session it means - the picker path had no other
   * caller and no test coverage, so it's removed rather than kept dead. */
  sessionId: string;
}

const FIRST_HOUR_CHARGE = 100;
const SUCCEEDING_HOUR_CHARGE = 50;

/** Mirrors daycareBilling.service.ts's computeDaycareCharge - used here only
 * to itemize the succeeding-hour count for display; the total shown is
 * always the session's own server-computed computed_charge (AC-2: "total
 * matches the backend's computed_charge exactly"), never recalculated. */
function succeedingHoursFor(checkInAt: string, checkOutAt: string): number {
  const elapsedMinutes =
    (new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 60000;

  if (elapsedMinutes <= 60) return 0;
  return Math.ceil((elapsedMinutes - 60) / 60);
}

/**
 * Issue #69 AC-2: checkout screen shows the charge broken down by hours
 * (base ₱100 first hour, plus each succeeding ₱50 hour itemized), not just a
 * single total.
 *
 * Daycare Queue redesign: this used to render as a tab panel inside
 * DaycareQueuePage, reachable either via its own session picker or a known
 * session id. The queue no longer has a Check Out tab at all - checking a
 * pet out now happens from the Boarding Checklist's per-pet view
 * (BoardingChecklistPage, reached by clicking a checked-in row on the
 * queue), which always already knows the session to check out.
 */
export function DaycareCheckoutPanel({
  accessToken,
  sessionId,
}: DaycareCheckoutPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState<DaycareSession | null>(null);

  async function submitCheckout() {
    setIsSubmitting(true);
    setError(null);

    const result = await checkOutDaycareSession(sessionId, accessToken);

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not check out this session.');
      return;
    }

    setCheckedOut(result.data);
  }

  if (checkedOut) {
    const succeedingHours =
      checkedOut.actual_check_out_at && checkedOut.check_in_at
        ? succeedingHoursFor(
            checkedOut.check_in_at,
            checkedOut.actual_check_out_at
          )
        : 0;
    const succeedingCharge = succeedingHours * SUCCEEDING_HOUR_CHARGE;

    return (
      <>
        <p className={styles.successBanner} role="status">
          Session checked out.
        </p>
        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>First hour</dt>
            <dd>₱{FIRST_HOUR_CHARGE}</dd>
          </div>
          {succeedingHours > 0 ? (
            <div className={styles.breakdownRow}>
              <dt>
                {succeedingHours} succeeding hour
                {succeedingHours > 1 ? 's' : ''} × ₱{SUCCEEDING_HOUR_CHARGE}
              </dt>
              <dd>₱{succeedingCharge}</dd>
            </div>
          ) : null}
          <div className={styles.breakdownTotal}>
            <dt>Total</dt>
            <dd>₱{checkedOut.computed_charge}</dd>
          </div>
        </dl>
      </>
    );
  }

  return (
    <>
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <p className={styles.copy}>Ready to check out this session?</p>

      <button
        type="button"
        className={styles.primaryButton}
        disabled={isSubmitting}
        onClick={() => void submitCheckout()}
      >
        {isSubmitting ? 'Checking out...' : 'Check out now'}
      </button>
    </>
  );
}
