import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listBookings } from '../../../../booking/api/booking.api';
import type { Booking } from '../../../../booking/booking.types';
import { deriveBookingConfirmationState } from '../../../../booking/bookingConfirmation';
import styles from './ReceptionistBookingsQueueWidget.module.css';

interface ReceptionistBookingsQueueWidgetProps {
  branchId: string;
  accessToken: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local-calendar YYYY-MM-DD, matching scheduled_start's own timezone
 * interpretation elsewhere in the booking queue pages. */
function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Receptionist dashboard's own big widget - unlike the Superadmin queue
 * widgets (one per module, count-only via QueueWidgetCard), this tracks
 * today's whole front-desk queue at once, broken out by
 * deriveBookingConfirmationState so an Unconfirmed (online, unpaid) booking
 * surfaces as something needing attention rather than blending into the
 * total - the actual "notifies" half of the requested "notifies and tracks
 * online and booking queues" widget.
 */
export function ReceptionistBookingsQueueWidget({
  branchId,
  accessToken,
}: ReceptionistBookingsQueueWidgetProps) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !branchId) return;

    let isMounted = true;

    void listBookings(accessToken, {
      branchId,
      date: todayDateString(),
    }).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load today’s bookings.');
        return;
      }

      setBookings(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId]);

  const isLoading = bookings === null && !error;

  const states = bookings?.map((booking) => ({
    booking,
    state: deriveBookingConfirmationState(booking),
  }));

  const unconfirmed =
    states?.filter((row) => row.state === 'Unconfirmed') ?? [];
  const confirmed = states?.filter((row) => row.state === 'Confirmed') ?? [];
  const inService = states?.filter((row) => row.state === 'In service') ?? [];

  const actionable = [...unconfirmed, ...confirmed, ...inService].sort(
    (a, b) =>
      new Date(a.booking.scheduled_start).getTime() -
      new Date(b.booking.scheduled_start).getTime()
  );
  const next = actionable[0];

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Today's Bookings Queue</h2>
        <Link to="/staff/bookings/queue" className={styles.viewLink}>
          View full queue
        </Link>
      </div>

      {isLoading ? (
        <p className={styles.copy}>Loading today's bookings...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : bookings && bookings.length === 0 ? (
        <p className={styles.copy}>No bookings scheduled for today.</p>
      ) : (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statCount}>{unconfirmed.length}</span>
              <span className={styles.statLabel}>Awaiting online payment</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statCount}>{confirmed.length}</span>
              <span className={styles.statLabel}>Ready to check in</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statCount}>{inService.length}</span>
              <span className={styles.statLabel}>In service</span>
            </div>
          </div>

          {unconfirmed.length > 0 ? (
            <p className={styles.alert} role="alert">
              {unconfirmed.length} online booking
              {unconfirmed.length === 1 ? '' : 's'} still need payment
              confirmation before check-in.
            </p>
          ) : null}

          {next ? (
            <p className={styles.next}>
              Next: {formatTime(next.booking.scheduled_start)} &middot;{' '}
              {next.state}
            </p>
          ) : (
            <p className={styles.copy}>Nothing left in the queue today.</p>
          )}
        </>
      )}
    </section>
  );
}
