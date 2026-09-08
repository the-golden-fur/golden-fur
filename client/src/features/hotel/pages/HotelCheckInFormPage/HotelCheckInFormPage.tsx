import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { getBooking } from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import { HOTEL_QUEUE_VIEWER_ROLES } from '../HotelQueuePage/hotelQueueRoles';
import { HotelCheckInPanel } from '../HotelQueuePage/HotelCheckInPanel';
import styles from './HotelCheckInFormPage.module.css';

/**
 * Custom change: the queue's "Check in" button now checks the pet in on the
 * spot, so this page is no longer in that path - it's the "View booking
 * details" destination from a queue row's "..." menu, for staff who need to
 * see or correct the auto-suggested cage and the booking's care
 * instructions (Edit toggle at the bottom) before checking in. Checking in
 * from here redirects back to the queue with `?checkedIn=success` so the
 * queue shows the same success modal the one-click path does - no "go to
 * checkout / check in another pet" landing page. Re-runs the same role gate
 * HotelQueuePage does (HOTEL_QUEUE_VIEWER_ROLES) rather than inheriting
 * one, since this is its own route now, not a tab panel.
 */
export function HotelCheckInFormPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [role, setRole] = useState<string | null>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoadingBooking, setIsLoadingBooking] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          HOTEL_QUEUE_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setRole(result.data.role);
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!accessToken || !bookingId) return;

    let isMounted = true;

    void getBooking(bookingId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoadingBooking(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load this booking.');
        return;
      }

      setBooking(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, bookingId]);

  if (!user?.id || !accessToken || !bookingId) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load this check-in.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading' || isLoadingBooking) {
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

  if (loadError || !booking) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'Booking not found.'}
          </p>
          <Link className={styles.backLink} to="/staff/hotel/queue">
            &larr; Back to Hotel Queue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link className={styles.backLink} to="/staff/hotel/queue">
          &larr; Back to Hotel Queue
        </Link>
        <h1 className={styles.title}>Booking details</h1>

        <HotelCheckInPanel
          key={booking.id}
          accessToken={accessToken}
          role={role ?? ''}
          booking={booking}
          onCheckedIn={() => navigate('/staff/hotel/queue?checkedIn=success')}
        />
      </div>
    </main>
  );
}
