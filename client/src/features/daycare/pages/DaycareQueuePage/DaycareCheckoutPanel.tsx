import { useState } from 'react';
import { DaycareSessionPicker } from '../../components/DaycareSessionPicker/DaycareSessionPicker';
import { checkOutDaycareSession } from '../../api/daycare.api';
import type { DaycareSession } from '../../daycare.types';
import styles from './DaycareCheckoutPanel.module.css';

interface DaycareCheckoutPanelProps {
  accessToken: string;
  /** Preselects the confirm step, skipping the picker - set by
   * DaycareQueuePage right after DaycareCheckInPanel checks a pet in, or by
   * the legacy /staff/daycare/checkout/:sessionId redirect. Null shows the
   * picker. */
  initialSessionId: string | null;
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
 * GET /daycare/sessions backs a search/filter/sort picker
 * (DaycareSessionPicker), mirroring HotelStayPicker's role on the Hotel
 * Checkout screen - selecting a card goes straight to a confirm step.
 *
 * Queue redesign: extracted from the former standalone DaycareCheckoutPage
 * so it can render as a tab panel inside DaycareQueuePage (alongside
 * DaycareCheckInPanel) instead of its own route - DaycareQueuePage renders
 * this with `key={initialSessionId ?? 'picker'}` so a fresh preselect (or a
 * return to the bare picker) resets this panel's internal state cleanly.
 */
export function DaycareCheckoutPanel({
  accessToken,
  initialSessionId,
}: DaycareCheckoutPanelProps) {
  const [selectedSession, setSelectedSession] = useState<DaycareSession | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState<DaycareSession | null>(null);

  async function submitCheckout(sessionId: string) {
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

  // Arrived with a known session id (DaycareCheckInPanel's "Go to
  // checkout", or the legacy /staff/daycare/checkout/:sessionId redirect) -
  // skip the picker and go straight to confirm.
  if (initialSessionId && !selectedSession) {
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
          onClick={() => void submitCheckout(initialSessionId)}
        >
          {isSubmitting ? 'Checking out...' : 'Check out now'}
        </button>
      </>
    );
  }

  if (selectedSession) {
    return (
      <>
        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>Checked in</dt>
            <dd>
              {selectedSession.check_in_at
                ? new Date(selectedSession.check_in_at).toLocaleString()
                : 'Unknown'}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSubmitting}
            onClick={() => void submitCheckout(selectedSession.id)}
          >
            {isSubmitting ? 'Checking out...' : 'Check out now'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setSelectedSession(null)}
          >
            Choose a different session
          </button>
        </div>
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

      <DaycareSessionPicker
        accessToken={accessToken}
        onSelect={setSelectedSession}
      />
    </>
  );
}
