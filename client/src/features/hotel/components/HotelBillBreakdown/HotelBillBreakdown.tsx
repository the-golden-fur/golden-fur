import type { HotelBillBreakdown as HotelBill } from '../../hotel.types';
import styles from '../../../daycare/components/DaycareBillBreakdown/DaycareBillBreakdown.module.css';

interface HotelBillBreakdownProps {
  /** The server's itemized bill - every line is read from it, nothing is
   * recalculated here, so the rows always add up to its total. */
  breakdown: HotelBill;
  /** Downpayment taken at booking, shown when there was one. */
  downpaymentCollected?: number | null;
  /** What checkout adds to the booking's Transactions. */
  addedAtCheckout?: number | null;
  /** What Transactions say is owed - the cashier's figure. Null reads as
   * just the bill's Total. */
  amountDue?: number | null;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * A Hotel stay's bill, line by line: the booked nights (or, for pay at
 * checkout, the nights actually stayed) at their nightly rate, any
 * discount/promo fixed at booking and the late-checkout nights - then what
 * was already collected, what checkout adds and what is left to collect.
 * The Hotel counterpart of DaycareBillBreakdown, styled the same so both
 * check-out confirmations read alike. Used before checkout (the preview)
 * and after it (the result).
 */
export function HotelBillBreakdown({
  breakdown,
  downpaymentCollected = null,
  addedAtCheckout = null,
  amountDue = null,
}: HotelBillBreakdownProps) {
  const hasSummary = amountDue !== null;

  return (
    <dl className={styles.breakdown}>
      <div className={styles.row}>
        <dt>
          {breakdown.pay_at_checkout
            ? 'Hotel stay (nights stayed)'
            : 'Hotel stay'}{' '}
          - {plural(breakdown.nights, 'night')} × ₱{breakdown.nightly_rate}
        </dt>
        <dd>₱{breakdown.stay_charge}</dd>
      </div>
      {breakdown.discount > 0 ? (
        <div className={styles.row}>
          <dt>Discount / promo</dt>
          <dd>-₱{breakdown.discount}</dd>
        </div>
      ) : null}
      {breakdown.late_nights > 0 && breakdown.late_rate !== null ? (
        <div className={`${styles.row} ${styles.late}`}>
          <dt>
            Late checkout - {plural(breakdown.late_nights, 'night')} × ₱
            {breakdown.late_rate}
          </dt>
          <dd>₱{breakdown.late_charge}</dd>
        </div>
      ) : null}
      <div className={hasSummary ? styles.subtotal : styles.total}>
        <dt>Total</dt>
        <dd>₱{breakdown.total}</dd>
      </div>
      {hasSummary ? (
        <>
          {downpaymentCollected ? (
            <div className={styles.row}>
              <dt>Downpayment already collected</dt>
              <dd>₱{downpaymentCollected}</dd>
            </div>
          ) : null}
          {addedAtCheckout ? (
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
