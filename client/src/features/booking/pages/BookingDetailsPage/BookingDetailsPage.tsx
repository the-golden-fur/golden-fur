import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getBookingDetails } from '../../api/booking.api';
import type { BookingDetails } from '../../booking.types';
import { BookingDetailsView } from '../../components/BookingDetailsView/BookingDetailsView';
import styles from './BookingDetailsPage.module.css';

/**
 * Issue: Bookings Queue's "View details" link, requested after the multi-
 * item rollout made the queue's row summary insufficient. Read-only - no
 * status/reschedule/cancel actions here, those stay on the queue list.
 *
 * Both this page and the customer My Bookings modal now render the shared
 * BookingDetailsView off one hydrated endpoint (GET /bookings/:id/details),
 * which also resolves the assigned staff + preferred cage this page never
 * used to show.
 */
export function BookingDetailsPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { accessToken } = useAuth();

  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !accessToken) return;

    let isMounted = true;

    void getBookingDetails(bookingId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load this booking.');
        return;
      }

      setDetails(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [bookingId, accessToken]);

  if (!bookingId || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load this booking.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading booking...</p>
        </div>
      </main>
    );
  }

  if (loadError || !details) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'Booking not found.'}
          </p>
          <Link to="/staff/bookings/queue" className={styles.secondaryButton}>
            Back to queue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link to="/staff/bookings/queue" className={styles.secondaryButton}>
          Back to queue
        </Link>

        <BookingDetailsView data={details} />
      </div>
    </main>
  );
}
