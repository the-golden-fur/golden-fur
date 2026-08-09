import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { HotelBookingPicker } from '../../components/HotelBookingPicker/HotelBookingPicker';
import { HotelCheckoutPanel } from './HotelCheckoutPanel';
import styles from './HotelQueuePage.module.css';

/** Shared with HotelCheckInFormPage - the routed check-in form is reached
 * from this page's picker but is its own route, so it needs the same role
 * gate rather than inheriting one. */
export const HOTEL_QUEUE_VIEWER_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
  'Groomer',
  'Pet Assistant',
]);
const ALLOWED_VIEWER_ROLES = HOTEL_QUEUE_VIEWER_ROLES;

type Tab = 'check-in' | 'check-out';

/**
 * Queue redesign: replaces the former separate Hotel Check-in and Hotel
 * Checkout pages/routes with one screen, matching the "Hotel Queue, not
 * Hotel Check-in + Hotel Checkout" request - the two flows are now tabs
 * sharing a single role check, instead of two standalone routes each doing
 * their own. Groomer and Pet Assistant are this page's intended users, not
 * Receptionist (deliberately narrower than HOTEL_ADVANCE_ROLES server-side,
 * which still allows Receptionist for other Hotel routes - see that
 * constant's own dev note in hotel.types.ts). The legacy /staff/hotel/check-in and
 * /staff/hotel/checkout(/:stayId) routes now redirect here (see
 * HotelLegacyRedirects.tsx), preserving HotelBookingPicker's own
 * "already checked in -> go to checkout" cross-link and any old bookmarks.
 */
export function HotelQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [branchId, setBranchId] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>(
    searchParams.get('tab') === 'check-out' ? 'check-out' : 'check-in'
  );
  // Custom change: no longer set from within this page (HotelCheckInPanel
  // used to call back into a setter here) - a check-in now navigates
  // straight to /staff/hotel/queue?tab=check-out&stayId=... instead, so
  // this only ever needs its lazy initial value from the URL.
  const [checkoutStayId] = useState<string | null>(searchParams.get('stayId'));

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
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the Hotel queue.
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
        <h1 className={styles.title}>Hotel Queue</h1>

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

        {tab === 'check-in' && branchId ? (
          <section>
            <h2 className={styles.sectionTitle}>Select a confirmed booking</h2>
            <HotelBookingPicker
              accessToken={accessToken}
              branchId={branchId}
              onSelect={(booking) =>
                navigate(`/staff/hotel/queue/check-in/${booking.id}`)
              }
              selectedBookingId={null}
            />
          </section>
        ) : null}

        {tab === 'check-out' ? (
          <HotelCheckoutPanel
            key={checkoutStayId ?? 'picker'}
            accessToken={accessToken}
            initialStayId={checkoutStayId}
          />
        ) : null}
      </div>
    </main>
  );
}
