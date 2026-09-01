import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import { applyFirstBookingPaymentSideEffects } from '../../booking/services/booking.service.ts';
import type { PaymentStatus } from '../../booking/booking.types.ts';
import type { CounterPaymentMethod, Transaction } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * The SECURITY DEFINER RPCs here can return either a bare row (RETURNS
 * bookings/transactions) or a one-element array (RETURNS SETOF ...)
 * depending on how the migration declares them - normalize both.
 */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] ?? null) as T | null;
  return (data ?? null) as T | null;
}

async function loadTransaction(transactionId: string): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Transaction not found');

  return data as Transaction;
}

/** The booking's payment_status *before* a settlement, so
 * applyFirstBookingPaymentSideEffects can tell a first payment (Pending ->
 * settled: re-check the slot, send the confirmation alerts) apart from a
 * later balance payment. Null for a transaction with no booking. */
async function loadBookingPaymentStatus(
  bookingId: string | null
): Promise<PaymentStatus | null> {
  if (!bookingId) return null;

  const { data } = await supabase
    .from('bookings')
    .select('payment_status')
    .eq('id', bookingId)
    .maybeSingle();

  return (data?.payment_status as PaymentStatus | undefined) ?? null;
}

export interface RecordTransactionPaymentParams {
  requesterId: string;
  transactionId: string;
  paymentMethod: CounterPaymentMethod;
  bankName?: string | null;
  paymentReference?: string | null;
  cashTendered?: number | null;
}

export interface RecordTransactionPaymentResult {
  transaction: Transaction;
  booking: unknown;
  changeAmount: number | null;
}

/**
 * Payment/transactions rework: a cashier records a counter payment against a
 * Pending booking_payment transaction (Cash/Card/Bank Transfer/Grabmart/
 * Pickaroo). Reuses resolvePaymentConfirmation to validate the cash tender
 * and compute change, then hands off to the settle_transaction RPC, which
 * flips the transaction to Fully Paid and recomputes bookings.payment_status
 * atomically. GCash/Maya are out of scope here (portal = webhook-confirmed;
 * walk-in-QR = settled through checkout); 'Credit' goes through
 * payTransactionWithCredit.
 */
export async function recordTransactionPayment({
  requesterId,
  transactionId,
  paymentMethod,
  bankName,
  paymentReference,
  cashTendered,
}: RecordTransactionPaymentParams): Promise<RecordTransactionPaymentResult> {
  const transaction = await loadTransaction(transactionId);

  if (transaction.transaction_type !== 'booking_payment') {
    throwWithStatus(400, 'Only booking payments can be settled here');
  }

  if (transaction.payment_status !== 'Pending') {
    throwWithStatus(
      409,
      `This transaction is already ${transaction.payment_status}`
    );
  }

  const amountDue = Number(transaction.total_amount);

  const { changeAmount } = resolvePaymentConfirmation({
    paymentMethod,
    amountDue,
    cashTendered: cashTendered ?? undefined,
  });

  const paymentStatusBefore = await loadBookingPaymentStatus(
    transaction.booking_id
  );

  const { data, error } = await supabase.rpc('settle_transaction', {
    p_transaction_id: transactionId,
    p_payment_method: paymentMethod,
    p_bank_name: bankName ?? null,
    p_payment_reference: paymentReference ?? null,
    p_cash_tendered: cashTendered ?? null,
    p_processed_by: requesterId,
  });

  if (error) throwWithStatus(400, error.message);

  let booking = firstRow<Record<string, unknown>>(data);

  // settle_transaction did the SQL rollup; run the app-side first-payment
  // side-effects (slot re-check + confirmation alerts) the webhook path gets.
  if (transaction.booking_id && paymentStatusBefore) {
    booking = (await applyFirstBookingPaymentSideEffects({
      bookingId: transaction.booking_id,
      paymentStatusBeforePayment: paymentStatusBefore,
      revertOnCapacityConflict: false,
    })) as unknown as Record<string, unknown>;
  }

  const settled = await loadTransaction(transactionId);

  return { transaction: settled, booking, changeAmount };
}

export interface AddBookingPaymentParams {
  requesterId: string;
  bookingId: string;
  amount: number;
}

/**
 * Payment/transactions rework: adds a balance charge against a booking - a
 * new Pending booking_payment transaction the cashier then settles like any
 * other. The add_booking_payment RPC validates amount <= remaining.
 */
export async function addBookingPayment({
  requesterId,
  bookingId,
  amount,
}: AddBookingPaymentParams): Promise<Transaction> {
  // add_booking_payment's "remaining" only nets settled rows, so without this
  // guard a staff member could stack several Pending charges that together
  // over-collect. Match the client, which hides "Add a payment" while any row
  // is still Pending.
  const { data: pending } = await supabase
    .from('transactions')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_status', 'Pending')
    .limit(1)
    .maybeSingle();

  if (pending) {
    throwWithStatus(
      409,
      'This booking already has an unsettled charge - record that payment first'
    );
  }

  const { data, error } = await supabase.rpc('add_booking_payment', {
    p_booking_id: bookingId,
    p_amount: amount,
    p_processed_by: requesterId,
  });

  if (error) throwWithStatus(400, error.message);

  const row = firstRow<Transaction>(data);
  if (!row) throwWithStatus(400, 'Failed to add the balance payment');

  return row;
}

export interface PayTransactionWithCreditParams {
  requesterId: string;
  transactionId: string;
  /** true when a BILLING_STAFF_ROLES caller is paying on the customer's
   * behalf - recorded as processed_by on the settle. A customer paying their
   * own transaction passes false and leaves processed_by null. */
  isStaff: boolean;
}

export interface PayTransactionWithCreditResult {
  transaction: Transaction;
  booking: unknown;
  creditTransaction: unknown;
}

/**
 * Payment/transactions rework: pays a Pending transaction entirely from the
 * customer's branch-locked credit balance. Full-cover only this round - if
 * the available credit doesn't cover the whole charge the caller must split
 * the transaction first. Redeems the credit (atomic redeem_credit RPC),
 * settles the transaction as 'Credit', and stamps credit_applied_amount.
 *
 * Ownership: a customer caller may only pay a transaction whose customer_id
 * is theirs; a staff caller (isStaff) may pay any.
 */
export async function payTransactionWithCredit({
  requesterId,
  transactionId,
  isStaff,
}: PayTransactionWithCreditParams): Promise<PayTransactionWithCreditResult> {
  const transaction = await loadTransaction(transactionId);

  if (!isStaff && transaction.customer_id !== requesterId) {
    throwWithStatus(403, 'You can only pay for your own transactions');
  }

  if (transaction.transaction_type !== 'booking_payment') {
    throwWithStatus(400, 'Only booking payments can be paid with credit');
  }

  if (transaction.payment_status !== 'Pending') {
    throwWithStatus(
      409,
      `This transaction is already ${transaction.payment_status}`
    );
  }

  const paymentStatusBefore = await loadBookingPaymentStatus(
    transaction.booking_id
  );

  const chargeAmount = Number(transaction.total_amount);
  const available = await getAvailableCredit(
    transaction.customer_id,
    transaction.branch_id
  );
  const amount = Math.min(available, chargeAmount);

  if (amount <= 0) {
    throwWithStatus(400, 'No credit available to apply');
  }

  if (amount < chargeAmount) {
    throwWithStatus(
      400,
      `Credit ₱${amount.toFixed(2)} doesn't cover this ₱${chargeAmount.toFixed(
        2
      )} charge — split it first`
    );
  }

  // Redeem + settle + roll up in ONE RPC (one Postgres transaction) - a
  // failure anywhere rolls the credit decrement back too, so credit is never
  // burned against a transaction that didn't get settled.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'pay_transaction_with_credit',
    {
      p_transaction_id: transactionId,
      p_amount: amount,
      p_processed_by: isStaff ? requesterId : null,
    }
  );

  if (rpcError) throwWithStatus(400, rpcError.message);
  let booking = firstRow<Record<string, unknown>>(rpcData);

  if (transaction.booking_id && paymentStatusBefore) {
    booking = (await applyFirstBookingPaymentSideEffects({
      bookingId: transaction.booking_id,
      paymentStatusBeforePayment: paymentStatusBefore,
      revertOnCapacityConflict: false,
    })) as unknown as Record<string, unknown>;
  }

  const { data: creditRow } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('transaction_type', 'redemption')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const settled = await loadTransaction(transactionId);

  return { transaction: settled, booking, creditTransaction: creditRow };
}
