import type { PaymentMethod } from '../../booking.types';
import styles from './PayMongoFeeNotice.module.css';

interface PayMongoFeeNoticeProps {
  paymentMethod: PaymentMethod | '';
}

const ONLINE_METHODS = new Set<PaymentMethod | ''>(['GCash', 'Maya']);

/**
 * TRUST BOUNDARY / STUB (#58 dev notes, out of scope until Sprint 5's real
 * M08 PayMongo integration): no PayMongo endpoint exists yet to source an
 * actual fee amount from, so this notice is illustrative/placeholder copy
 * only - it must not be read as a computed fee. The booking-creation call
 * this step leads to also trusts the client-declared payment_confirmed
 * outcome rather than a real webhook; that trust boundary is flagged
 * separately where the submit call is made.
 */
export function PayMongoFeeNotice({ paymentMethod }: PayMongoFeeNoticeProps) {
  if (!ONLINE_METHODS.has(paymentMethod)) {
    return null;
  }

  return (
    <p className={styles.notice} role="note">
      {paymentMethod} payments include a small online processing fee, charged
      by our payment partner in addition to your service total. The exact fee
      will be shown by PayMongo at checkout.
    </p>
  );
}
