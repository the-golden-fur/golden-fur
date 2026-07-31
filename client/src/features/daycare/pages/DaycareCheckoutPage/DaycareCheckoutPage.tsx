import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { DaycareSessionPicker } from '../../components/DaycareSessionPicker/DaycareSessionPicker';
import { checkOutDaycareSession } from '../../api/daycare.api';
import type { DaycareSession } from '../../daycare.types';
import styles from './DaycareCheckoutPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

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
 * Checkout screen - selecting a card goes straight to a confirm step, same
 * as HotelCheckoutPage (no more raw "paste the session id" text field).
 * Arriving with a :sessionId route param (DaycareCheckInPage's "Go to
 * checkout" link) skips the picker entirely and goes straight to confirm.
 */
export function DaycareCheckoutPage() {
  const { user, accessToken } = useAuth();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [selectedSession, setSelectedSession] = useState<DaycareSession | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState<DaycareSession | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  async function submitCheckout(sessionId: string) {
    if (!accessToken) return;

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

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load Daycare checkout.
        </p>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  if (checkedOut) {
    const succeedingHours = checkedOut.check_out_at
      ? succeedingHoursFor(checkedOut.check_in_at, checkedOut.check_out_at)
      : 0;
    const succeedingCharge = succeedingHours * SUCCEEDING_HOUR_CHARGE;

    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Daycare Checkout</h1>
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
      </main>
    );
  }

  // Reached via a direct link (DaycareCheckInPage) with a known session id -
  // skip the picker and go straight to confirm.
  if (routeSessionId && !selectedSession) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Daycare Checkout</h1>

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
          onClick={() => void submitCheckout(routeSessionId)}
        >
          {isSubmitting ? 'Checking out...' : 'Check out now'}
        </button>
      </main>
    );
  }

  if (selectedSession) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Daycare Checkout</h1>

        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>Checked in</dt>
            <dd>{new Date(selectedSession.check_in_at).toLocaleString()}</dd>
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
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Daycare Checkout</h1>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <DaycareSessionPicker
        accessToken={accessToken}
        onSelect={setSelectedSession}
      />
    </main>
  );
}
