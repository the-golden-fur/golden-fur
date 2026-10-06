import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { formatCountdown } from './formatCountdown';
import { overdueFeeSoFar } from './overdueFeeSoFar';
import styles from './CageOccupancyReport.module.css';

interface CheckoutCountdownProps {
  /** ISO timestamp of the booking's scheduled end. */
  expectedCheckoutAt: string;
  /** Daycare only: the flat fee charged per overdue hour, and how late the
   * pickup may be before it starts. Left out (or null) for Hotel, which has
   * no hourly overdue fee - the label then shows the elapsed time alone. */
  overdueFeePerHour?: number | null;
  overdueGraceMinutes?: number | null;
}

/**
 * Live countdown to a cage occupant's expected checkout - the booking's own
 * scheduled end (Hotel: check-in + nights booked; Daycare: start + hours
 * booked). Flips to "Overdue by ..." once that time has passed, and for a
 * Daycare pet also shows the overdue fee run up so far. Ticks every second
 * on its own, so only this label re-renders, not the whole page.
 */
export function CheckoutCountdown({
  expectedCheckoutAt,
  overdueFeePerHour = null,
  overdueGraceMinutes = null,
}: CheckoutCountdownProps) {
  const nowMs = useNowMs(1000);
  const remainingMs = new Date(expectedCheckoutAt).getTime() - nowMs;
  const isOverdue = remainingMs < 0;
  const fee =
    isOverdue && overdueFeePerHour !== null
      ? overdueFeeSoFar(-remainingMs, overdueFeePerHour, overdueGraceMinutes)
      : 0;

  return (
    <span
      className={isOverdue ? styles.countdownOverdue : styles.countdown}
      // The visible text changes every second - announcing each tick would
      // be unusable with a screen reader.
      aria-live="off"
    >
      {isOverdue
        ? `Overdue by ${formatCountdown(remainingMs)}`
        : `Checkout in ${formatCountdown(remainingMs)}`}
      {fee > 0 ? ` · ₱${fee} overdue fee` : null}
    </span>
  );
}
