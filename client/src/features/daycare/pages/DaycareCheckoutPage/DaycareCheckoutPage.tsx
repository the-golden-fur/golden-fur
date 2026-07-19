import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
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
 * Reviewer scope note: #65's backend has no "list active sessions" endpoint
 * (only POST /daycare/check-in and POST /daycare/sessions/:id/checkout), so
 * this screen is reached with a known session id - either passed via the
 * route (DaycareCheckInPage's "Go to checkout" link, right after check-in)
 * or entered/pasted manually. A dedicated "browse active sessions at my
 * branch" endpoint would need a new GET route, which is outside this issue's
 * (client-only) Affected Files.
 */
export function DaycareCheckoutPage() {
  const { user, accessToken } = useAuth();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [sessionId, setSessionId] = useState(routeSessionId ?? '');
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

  async function submitCheckout() {
    if (!accessToken || !sessionId.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const result = await checkOutDaycareSession(sessionId.trim(), accessToken);

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
    return <Navigate to="/staff/profile" replace />;
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
                {succeedingHours} succeeding hour{succeedingHours > 1 ? 's' : ''}{' '}
                × ₱{SUCCEEDING_HOUR_CHARGE}
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

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Daycare Checkout</h1>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Session ID</span>
        <input
          className={styles.input}
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
        />
      </label>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className={styles.primaryButton}
        disabled={!sessionId.trim() || isSubmitting}
        onClick={() => void submitCheckout()}
      >
        {isSubmitting ? 'Checking out...' : 'Check out'}
      </button>
    </main>
  );
}
