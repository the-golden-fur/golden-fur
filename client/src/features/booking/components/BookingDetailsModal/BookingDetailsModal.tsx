import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { getBookingDetails } from '../../api/booking.api';
import type { BookingDetails } from '../../booking.types';
import { BookingDetailsView } from '../BookingDetailsView/BookingDetailsView';
import styles from './BookingDetailsModal.module.css';

interface BookingDetailsModalProps {
  /** The booking to show, or null when the modal is closed. */
  bookingId: string | null;
  onClose: () => void;
}

/**
 * "View details" for a customer's own booking (CustomerBookingsPage's "..."
 * menu). Wraps the shared Modal + BookingDetailsView, fetching the hydrated
 * booking from GET /bookings/:id/details on open. Hand-rolled fetch state to
 * match the rest of the booking feature (no react-query in this repo).
 */
export function BookingDetailsModal({
  bookingId,
  onClose,
}: BookingDetailsModalProps) {
  const { accessToken } = useAuth();

  const [state, setState] = useState<{
    loadedFor: string | null;
    details: BookingDetails | null;
    error: string | null;
  }>({ loadedFor: null, details: null, error: null });

  useEffect(() => {
    if (!bookingId || !accessToken) return;

    let isMounted = true;

    void getBookingDetails(bookingId, accessToken).then((result) => {
      if (!isMounted) return;

      setState({
        loadedFor: bookingId,
        details: result.data,
        error:
          result.error ?? (result.data ? null : 'Could not load this booking.'),
      });
    });

    return () => {
      isMounted = false;
    };
  }, [bookingId, accessToken]);

  const isOpen = bookingId !== null;
  const isLoading = isOpen && state.loadedFor !== bookingId;

  return (
    <Modal isOpen={isOpen} title="Booking details" onClose={onClose}>
      {isLoading ? (
        <p className={styles.copy}>Loading booking details...</p>
      ) : state.error || !state.details ? (
        <p className={styles.errorBanner} role="alert">
          {state.error ?? 'Could not load this booking.'}
        </p>
      ) : (
        <BookingDetailsView data={state.details} />
      )}
    </Modal>
  );
}
