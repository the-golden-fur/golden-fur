import type { PaymentMethod, PaymentStatus } from '../billing.types.ts';

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
  amountDue: number;
  cashTendered?: number;
}

export interface ResolvedPayment {
  paymentStatus: PaymentStatus;
  changeAmount: number | null;
}

/**
 * Every payment method - Cash, GCash, Maya, Card, Bank Transfer, Grabmart,
 * Pickaroo - goes through one cashier-confirmation path: the transaction is
 * Fully Paid the moment this call succeeds, with Cash additionally returning
 * a computed change amount. There is no online/webhook-confirmed path.
 */
export function resolvePaymentConfirmation({
  paymentMethod,
  amountDue,
  cashTendered,
}: ResolvePaymentInput): ResolvedPayment {
  const changeAmount =
    paymentMethod === 'Cash'
      ? computeCashChange(amountDue, cashTendered ?? 0)
      : null;

  return { paymentStatus: 'Fully Paid', changeAmount };
}
