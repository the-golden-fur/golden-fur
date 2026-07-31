import type { PaymentMethod, PaymentStatus } from '../billing.types.ts';
import { ONLINE_PAYMENT_METHODS } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Rounds to the nearest centavo - matches numeric(10,2) column precision. */
export function computeCashChange(
  amountDue: number,
  cashTendered: number
): number {
  if (cashTendered < amountDue) {
    throwWithStatus(400, 'Cash tendered is less than the amount due');
  }

  return Math.round((cashTendered - amountDue) * 100) / 100;
}

export interface ResolvePaymentInput {
  paymentMethod: PaymentMethod;
  onlineChannel?: 'portal' | 'walk_in_qr';
  amountDue: number;
  cashTendered?: number;
}

export interface ResolvedPayment {
  paymentStatus: PaymentStatus;
  changeAmount: number | null;
}

/**
 * Issue #83: the five manual methods (Cash, Card, Bank Transfer, Grabmart,
 * Pickaroo) and GCash/Maya's walk-in-QR channel all go through one
 * cashier-confirmation path - the transaction is Fully Paid the moment this
 * call succeeds, with Cash additionally returning a computed change amount.
 * GCash/Maya's portal channel is the one exception: it stays Pending here -
 * only the PayMongo webhook (paymongo.service.ts) flips it to Fully Paid,
 * with no cashier action in between (AC-2).
 */
export function resolvePaymentConfirmation({
  paymentMethod,
  onlineChannel,
  amountDue,
  cashTendered,
}: ResolvePaymentInput): ResolvedPayment {
  const isOnlineMethod = (
    ONLINE_PAYMENT_METHODS as readonly PaymentMethod[]
  ).includes(paymentMethod);

  if (isOnlineMethod && onlineChannel === 'portal') {
    return { paymentStatus: 'Pending', changeAmount: null };
  }

  const changeAmount =
    paymentMethod === 'Cash'
      ? computeCashChange(amountDue, cashTendered ?? 0)
      : null;

  return { paymentStatus: 'Fully Paid', changeAmount };
}
