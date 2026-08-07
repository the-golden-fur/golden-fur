import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { DaycareCheckInPanel } from './DaycareCheckInPanel';
import { DaycareCheckoutPanel } from './DaycareCheckoutPanel';
import styles from './DaycareQueuePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
  'Groomer',
  'Pet Assistant',
]);

type Tab = 'check-in' | 'check-out';

/**
 * Queue redesign: replaces the former separate Daycare Check-in and Daycare
 * Checkout pages/routes with one screen, matching the "Daycare Queue, not
 * Daycare Check-in + Daycare Checkout" request - mirrors HotelQueuePage.
 * Groomer and Pet Assistant can act here too (Daycare has no dedicated
 * assigned-staff role, unlike Grooming/Veterinary - see
 * DAYCARE_ADVANCE_ROLES server-side). The legacy /staff/daycare/check-in
 * and /staff/daycare/checkout(/:sessionId) routes now redirect here (see
 * DaycareLegacyRedirects.tsx).
 */
export function DaycareQueuePage() {
  const { user, accessToken } = useAuth();
  const [searchParams] = useSearchParams();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [branchId, setBranchId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>(
    searchParams.get('tab') === 'check-out' ? 'check-out' : 'check-in'
  );
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(
    searchParams.get('sessionId')
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setBranchId(result.data.branch_id);
        setRole(result.data.role);
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  function handleCheckedIn(sessionId: string) {
    setCheckoutSessionId(sessionId);
    setTab('check-out');
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the Daycare queue.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Daycare Queue</h1>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'check-in'}
            className={tab === 'check-in' ? styles.tabActive : styles.tab}
            onClick={() => setTab('check-in')}
          >
            Check In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'check-out'}
            className={tab === 'check-out' ? styles.tabActive : styles.tab}
            onClick={() => setTab('check-out')}
          >
            Check Out
          </button>
        </div>

        {tab === 'check-in' && branchId && role ? (
          <DaycareCheckInPanel
            accessToken={accessToken}
            role={role}
            branchId={branchId}
            onCheckedIn={handleCheckedIn}
          />
        ) : null}

        {tab === 'check-out' ? (
          <DaycareCheckoutPanel
            key={checkoutSessionId ?? 'picker'}
            accessToken={accessToken}
            initialSessionId={checkoutSessionId}
          />
        ) : null}
      </div>
    </main>
  );
}
