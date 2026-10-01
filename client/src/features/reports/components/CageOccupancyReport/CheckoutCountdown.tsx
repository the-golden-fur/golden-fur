import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { formatCountdown } from './formatCountdown';
import styles from './CageOccupancyReport.module.css';

interface CheckoutCountdownProps {
  /** ISO timestamp of the booking's scheduled end. */
  expectedCheckoutAt: string;
}

/**
 * Live countdown to a cage occupant's expected checkout - the booking's own
 * scheduled end (Hotel: check-in + nights booked; Daycare: start + hours
 * booked). Flips to "Overdue by ..." once that time has passed. Ticks every
 * second on its own, so only this label re-renders, not the whole page.
 */
export function CheckoutCountdown({
  expectedCheckoutAt,
}: CheckoutCountdownProps) {
  const nowMs = useNowMs(1000);
  const remainingMs = new Date(expectedCheckoutAt).getTime() - nowMs;
  const isOverdue = remainingMs < 0;

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
    </span>
  );
}
