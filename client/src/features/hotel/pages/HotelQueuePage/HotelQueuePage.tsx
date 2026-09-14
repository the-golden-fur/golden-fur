import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type { Booking } from '../../../booking/booking.types';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { checkInHotelStay } from '../../api/hotel.api';
import { HotelBookingPicker } from '../../components/HotelBookingPicker/HotelBookingPicker';
import { buildQuickCheckInPayload } from './buildQuickCheckInPayload';
import { HotelCheckoutPanel } from './HotelCheckoutPanel';
import { HOTEL_QUEUE_VIEWER_ROLES } from './hotelQueueRoles';
import styles from './HotelQueuePage.module.css';

const ALLOWED_VIEWER_ROLES = HOTEL_QUEUE_VIEWER_ROLES;

type Tab = 'check-in' | 'check-out';

/** Result of a check-in, shown as a modal over the still-visible queue -
 * either the one-click "Check in" button here, or a check-in completed on
 * the booking-details page, which redirects back with `?checkedIn=success`. */
type CheckInFeedback =
  | { status: 'success' }
  | { status: 'error'; message: string };

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
 *
 * Custom change: the Check In tab's "Check in" button now checks the pet in
 * on the spot (buildQuickCheckInPayload - the booking's own care
 * instructions, server-resolved cage) and reports the outcome in a modal,
 * instead of routing to a check-in form and then a "go to checkout / check
 * in another pet" landing page. The old form still exists, one level down,
 * as the "..." menu's "View booking details".
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

  // A check-in on the booking-details page redirects back here with
  // ?checkedIn=success - surface the same success modal a one-click
  // check-in from this page shows.
  const [checkInFeedback, setCheckInFeedback] =
    useState<CheckInFeedback | null>(
      searchParams.get('checkedIn') === 'success' ? { status: 'success' } : null
    );
  const [checkingInBookingId, setCheckingInBookingId] = useState<string | null>(
    null
  );
  // Bumped after a successful check-in to remount HotelBookingPicker, so the
  // just-checked-in booking drops out of its Pending list.
  const [pickerReloadKey, setPickerReloadKey] = useState(0);

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

  async function handleQuickCheckIn(booking: Booking) {
    if (!accessToken || checkingInBookingId) return;

    setCheckingInBookingId(booking.id);
    const result = await checkInHotelStay(
      accessToken,
      buildQuickCheckInPayload(booking)
    );
    setCheckingInBookingId(null);

    if (result.error || !result.data) {
      setCheckInFeedback({
        status: 'error',
        message: result.error ?? 'Could not check in this pet.',
      });
      return;
    }

    setCheckInFeedback({ status: 'success' });
    setPickerReloadKey((key) => key + 1);
  }

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
              key={pickerReloadKey}
              accessToken={accessToken}
              branchId={branchId}
              onCheckIn={handleQuickCheckIn}
              onViewDetails={(booking) =>
                navigate(`/staff/hotel/queue/check-in/${booking.id}`)
              }
              checkingInBookingId={checkingInBookingId}
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

      <Modal
        isOpen={checkInFeedback !== null}
        title={
          checkInFeedback?.status === 'error'
            ? 'Check-in failed'
            : 'Pet checked in'
        }
        onClose={() => setCheckInFeedback(null)}
      >
        <p className={styles.copy}>
          {checkInFeedback?.status === 'error'
            ? checkInFeedback.message
            : 'Pet checked in successfully.'}
        </p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalButton}
            onClick={() => setCheckInFeedback(null)}
          >
            Done
          </button>
        </div>
      </Modal>
    </main>
  );
}
