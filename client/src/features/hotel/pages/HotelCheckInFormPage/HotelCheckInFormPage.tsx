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
 * Custom change: the check-in form used to pop up inline at the bottom of
 * HotelQueuePage's Check In tab once a booking was picked - it's now a real
 * routed page (reached by HotelBookingPicker's onSelect on that tab), so
 * editing a check-in has its own URL/back button instead of scrolling to a
 * form appended below the picker. Re-runs the same role gate
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
        <h1 className={styles.title}>Check in</h1>

        <HotelCheckInPanel
          key={booking.id}
          accessToken={accessToken}
          role={role ?? ''}
          booking={booking}
          onCheckedIn={(stayId) =>
            navigate(`/staff/hotel/queue?tab=check-out&stayId=${stayId}`)
          }
        />
      </div>
    </main>
  );
}
