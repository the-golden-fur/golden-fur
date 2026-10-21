import type { DaycareChargeBreakdown } from '../../daycare.types';
import styles from './DaycareBillBreakdown.module.css';

interface DaycareBillBreakdownProps {
  /** The server's itemized charge - every line is read from it, nothing is
   * recalculated here, so the rows always add up to `total`. */
  breakdown?: DaycareChargeBreakdown;
  /** The whole session's cost (computed_charge). */
  total: number;
  /** What the booking's Daycare hours were charged at booking. */
  bookedCharge?: number | null;
  /** What checkout adds to the booking's Transactions on top of that. */
  addedAtCheckout?: number | null;
  /** What Transactions say is owed - the cashier's figure. Null for a
   * walk-in, which then reads as just its Total. */
  amountDue?: number | null;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * A Daycare session's bill, line by line: the first hour, each succeeding
 * hour, the overdue checkout hours at the flat overdue rate and any night
 * the pet was not picked up before closing at the Hotel rate - then, for a
 * booked session, what was charged at booking, what checkout adds and what
 * is left to collect. Used before checkout (the preview in the cage card's
 * confirmation), after it (the cage card's result and the Boarding
 * Checklist's checkout panel), so staff always read the same bill.
 */
export function DaycareBillBreakdown({
  breakdown,
  total,
  bookedCharge = null,
  addedAtCheckout = null,
  amountDue = null,
}: DaycareBillBreakdownProps) {
  const hasSummary = amountDue !== null;

  return (
    <dl className={styles.breakdown}>
      {breakdown ? (
        <>
          <div className={styles.row}>
            <dt>First hour</dt>
            <dd>₱{breakdown.first_hour_fee}</dd>
          </div>
          {breakdown.succeeding_hours > 0 ? (
            <div className={styles.row}>
              <dt>
                {plural(breakdown.succeeding_hours, 'succeeding hour')} × ₱
                {breakdown.succeeding_hour_fee}
              </dt>
              <dd>
                ₱{breakdown.succeeding_hours * breakdown.succeeding_hour_fee}
              </dd>
            </div>
          ) : null}
          {breakdown.overdue_hours > 0 ? (
            <div className={`${styles.row} ${styles.late}`}>
              <dt>
                Overdue checkout - {plural(breakdown.overdue_hours, 'hour')} × ₱
                {breakdown.overdue_hour_fee}
              </dt>
              <dd>₱{breakdown.overdue_charge}</dd>
            </div>
          ) : null}
          {breakdown.nights > 0 && breakdown.nightly_rate !== null ? (
            <div className={`${styles.row} ${styles.late}`}>
              <dt>
                Not picked up before closing -{' '}
                {plural(breakdown.nights, 'night')} × ₱{breakdown.nightly_rate}{' '}
                (Hotel rate)
              </dt>
              <dd>₱{breakdown.overnight_charge}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      <div className={hasSummary ? styles.subtotal : styles.total}>
        <dt>Total</dt>
        <dd>₱{total}</dd>
      </div>
      {hasSummary ? (
        <>
          {bookedCharge !== null ? (
            <div className={styles.row}>
              <dt>Charged at booking</dt>
              <dd>₱{bookedCharge}</dd>
            </div>
          ) : null}
          {addedAtCheckout !== null ? (
            <div className={styles.row}>
              <dt>Added to the bill at checkout</dt>
              <dd>₱{addedAtCheckout}</dd>
            </div>
          ) : null}
          <div className={styles.total}>
            <dt>To collect at the cashier</dt>
            <dd>₱{amountDue}</dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}
