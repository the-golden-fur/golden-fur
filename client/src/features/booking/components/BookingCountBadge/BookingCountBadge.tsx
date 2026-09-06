import styles from './BookingCountBadge.module.css';

interface BookingCountBadgeProps {
  /** bookingsList.length from CustomerBookingFlowPage - deliberately kept
   * as a plain count rather than the SubBookingDraft[] itself, so this stays
   * a dumb presentational component with no domain knowledge (same reason
   * BookingStepper only ever sees `steps: string[]`, never step definitions). */
  count: number;
}

/** Multi-booking checkout status indicator, rendered alongside
 * BookingStepper rather than as a prop on it - a booking count is cosmetic
 * to step navigation, not part of what step you're on. Renders nothing
 * before the first booking is committed (count === 0), so a standalone,
 * non-multi checkout never shows it at all. */
export function BookingCountBadge({ count }: BookingCountBadgeProps) {
  if (count === 0) return null;

  return (
    <p className={styles.badge} role="status">
      {count === 1
        ? '1 booking in this checkout'
        : `${count} bookings in this checkout`}
    </p>
  );
}
