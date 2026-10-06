import { useState } from 'react';
import { checkOutDaycareSession } from '../../api/daycare.api';
import type { DaycareCheckoutResult } from '../../daycare.types';
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
  /** Called once the session has actually been checked out - lets a list
   * that embeds this panel (the Bookings Queue) update its own row without
   * waiting for its next refresh. */
  onCheckedOut?: () => void;
}

/**
 * Issue #69 AC-2: checkout screen shows the charge broken down by hours
 * (the first hour, plus each succeeding hour itemized), not just a single
 * total. The figures come from the server's own charge_breakdown - nothing
 * is recalculated here, so the lines always add up to computed_charge. A
 * booked pet picked up past its booked end time gets an extra line for the
 * overdue hours, and one that wasn't picked up before closing gets an extra
 * line for the night(s) at the Hotel nightly rate.
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
  onCheckedOut,
}: DaycareCheckoutPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState<DaycareCheckoutResult | null>(
    null
  );

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
    onCheckedOut?.();
  }

  if (checkedOut) {
    const breakdown = checkedOut.charge_breakdown;

    return (
      <>
        <p className={styles.successBanner} role="status">
          {checkedOut.billed_at_checkout
            ? 'Session checked out. The bill has been sent to the cashier.'
            : 'Session checked out.'}
        </p>
        <dl className={styles.breakdown}>
          {breakdown ? (
            <>
              <div className={styles.breakdownRow}>
                <dt>First hour</dt>
                <dd>₱{breakdown.first_hour_fee}</dd>
              </div>
              {breakdown.succeeding_hours > 0 ? (
                <div className={styles.breakdownRow}>
                  <dt>
                    {breakdown.succeeding_hours} succeeding hour
                    {breakdown.succeeding_hours > 1 ? 's' : ''} × ₱
                    {breakdown.succeeding_hour_fee}
                  </dt>
                  <dd>
                    ₱
                    {breakdown.succeeding_hours * breakdown.succeeding_hour_fee}
                  </dd>
                </div>
              ) : null}
              {breakdown.overdue_hours > 0 ? (
                <div className={styles.breakdownRow}>
                  <dt>
                    Overdue checkout - {breakdown.overdue_hours} hour
                    {breakdown.overdue_hours > 1 ? 's' : ''} × ₱
                    {breakdown.overdue_hour_fee}
                  </dt>
                  <dd>₱{breakdown.overdue_charge}</dd>
                </div>
              ) : null}
              {breakdown.nights > 0 && breakdown.nightly_rate !== null ? (
                <div className={styles.breakdownRow}>
                  <dt>
                    Not picked up before closing - {breakdown.nights} night
                    {breakdown.nights > 1 ? 's' : ''} × ₱
                    {breakdown.nightly_rate} (Hotel rate)
                  </dt>
                  <dd>₱{breakdown.overnight_charge}</dd>
                </div>
              ) : null}
            </>
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
