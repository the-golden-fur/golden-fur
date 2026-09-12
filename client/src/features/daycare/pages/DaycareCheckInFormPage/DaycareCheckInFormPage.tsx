import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { getBooking } from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import { DAYCARE_QUEUE_VIEWER_ROLES } from '../DaycareQueuePage/daycareQueueRoles';
import { DaycareCheckInPanel } from '../DaycareQueuePage/DaycareCheckInPanel';
import styles from './DaycareCheckInFormPage.module.css';

/**
 * Daycare Queue redesign: the "..." view-details destination from a Pending
 * queue row - where staff finalize the auto-suggested cage and the
 * booking's care instructions before checking a pet in. Mirrors
 * HotelCheckInFormPage exactly (down to the role-gate-per-route rationale,
 * since this is its own route, not a tab panel). Checking in from here
 * navigates back to the queue with `?checkedIn=success`.
 */
export function DaycareCheckInFormPage() {
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
          DAYCARE_QUEUE_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
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
          <Link className={styles.backLink} to="/staff/daycare/queue">
            &larr; Back to Daycare Queue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link className={styles.backLink} to="/staff/daycare/queue">
          &larr; Back to Daycare Queue
        </Link>
        <h1 className={styles.title}>Booking details</h1>

        <DaycareCheckInPanel
          key={booking.id}
          accessToken={accessToken}
          role={role ?? ''}
          booking={booking}
          onCheckedIn={() => navigate('/staff/daycare/queue?checkedIn=success')}
        />
      </div>
    </main>
  );
}
