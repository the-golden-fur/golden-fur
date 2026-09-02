import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import { applyFirstBookingPaymentSideEffects } from '../../booking/services/booking.service.ts';
import type { PaymentStatus } from '../../booking/booking.types.ts';
import type { PaymentMethod, Transaction } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Rounds to the nearest centavo - matches numeric(10,2) column precision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Ids of the booking's current Pending 'balance' booking_payment rows -
 * snapshotted before a settle so loadSpawnedLeftover can spot the one a
 * partial settlement adds. */
async function pendingBalanceTxnIds(
  bookingId: string | null
): Promise<Set<string>> {
  if (!bookingId) return new Set();

  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_status', 'Pending')
    .eq('payment_choice', 'balance');

  return new Set((data ?? []).map((row) => (row as { id: string }).id));
}

/**
 * The Pending 'balance' transaction a partial settlement spawned, if any -
 * settle_transaction / pay_transaction_with_credit insert it inside the same
 * Postgres transaction as the settle. `before` is the id set from
 * pendingBalanceTxnIds() taken just before the RPC. Null when the payment
 * covered the whole transaction.
 */
async function loadSpawnedLeftover(
  bookingId: string | null,
  before: Set<string>
): Promise<Transaction | null> {
  if (!bookingId) return null;

  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('transaction_type', 'booking_payment')
    .eq('payment_status', 'Pending')
    .eq('payment_choice', 'balance')
    .order('created_at', { ascending: false });

  const spawned = (data ?? []).find(
    (row) => !before.has((row as { id: string }).id)
  );

  return (spawned as Transaction | undefined) ?? null;
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
  paymentMethod: PaymentMethod;
  bankName?: string | null;
  paymentReference?: string | null;
  cashTendered?: number | null;
  /** Amount actually collected. Defaults to the transaction's full
   * total_amount; when less, settle_transaction settles this row for the
   * partial amount and spawns a Pending 'balance' transaction for the rest. */
  amountApplied?: number | null;
}

export interface RecordTransactionPaymentResult {
  transaction: Transaction;
  booking: unknown;
  changeAmount: number | null;
  /** The Pending 'balance' transaction created for the unpaid remainder when
   * this was a partial settlement; null otherwise. */
  leftover: Transaction | null;
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
  amountApplied,
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

  const transactionTotal = Number(transaction.total_amount);
  // How much is actually being collected now - the whole transaction by
  // default, or a smaller amount (settle_transaction then spawns a Pending
  // 'balance' row for the remainder). Never more than the transaction total.
  const applied =
    amountApplied != null ? round2(amountApplied) : transactionTotal;

  if (applied <= 0) {
    throwWithStatus(400, 'Amount to collect must be more than zero');
  }
  if (applied > transactionTotal + 0.001) {
    throwWithStatus(
      400,
      'Amount to collect cannot exceed the transaction total'
    );
  }

  // The cash-tender check + change are against the amount being collected
  // now, not the full transaction total.
  const { changeAmount } = resolvePaymentConfirmation({
    paymentMethod,
    amountDue: applied,
    cashTendered: cashTendered ?? undefined,
  });

  const paymentStatusBefore = await loadBookingPaymentStatus(
    transaction.booking_id
  );
  const balanceIdsBefore = await pendingBalanceTxnIds(transaction.booking_id);

  const { data, error } = await supabase.rpc('settle_transaction', {
    p_transaction_id: transactionId,
    p_payment_method: paymentMethod,
    p_bank_name: bankName ?? null,
    p_payment_reference: paymentReference ?? null,
    p_cash_tendered: cashTendered ?? null,
    p_processed_by: requesterId,
    p_amount_applied: applied,
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
  const leftover = await loadSpawnedLeftover(
    transaction.booking_id,
    balanceIdsBefore
  );

  return { transaction: settled, booking, changeAmount, leftover };
}

export interface AddBookingPaymentParams {
  requesterId: string;
  bookingId: string;
  amount: number;
}

/**
 * Payment/transactions rework: adds a balance charge against a booking - a
 * new Pending booking_payment transaction the cashier then settles like any
 * other. Since 20260902165 the add_booking_payment RPC validates
 * amount <= net - settled - already-Pending, so it is safe to add another
 * charge even while the booking still carries the Pending 'balance' row that
 * create_initial_booking_charge emits for a down-payment booking - no
 * app-side "one Pending charge only" guard is needed any more.
 */
export async function addBookingPayment({
  requesterId,
  bookingId,
  amount,
}: AddBookingPaymentParams): Promise<Transaction> {
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
  /** The Pending 'balance' transaction created for the remainder when the
   * available credit only partly covered the charge; null otherwise. */
  leftover: Transaction | null;
}

/**
 * Payment/transactions rework: pays a Pending transaction from the customer's
 * branch-locked credit balance. When the available credit covers the whole
 * charge the transaction settles Fully Paid; when it only covers part,
 * pay_transaction_with_credit (20260902164) settles this row for what the
 * credit covered and spawns a Pending 'balance' transaction for the rest -
 * same partial-then-leftover behaviour as a partial cash settlement. Redeems
 * the credit + settles + rolls up in one atomic RPC.
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
  const balanceIdsBefore = await pendingBalanceTxnIds(transaction.booking_id);

  const chargeAmount = round2(Number(transaction.total_amount));
  const available = await getAvailableCredit(
    transaction.customer_id,
    transaction.branch_id
  );
  const amount = round2(Math.min(available, chargeAmount));

  if (amount <= 0) {
    throwWithStatus(400, 'No credit available to apply');
  }

  // Redeem + settle + roll up in ONE RPC (one Postgres transaction) - a
  // failure anywhere rolls the credit decrement back too, so credit is never
  // burned against a transaction that didn't get settled. When `amount` is
  // less than the charge the RPC spawns a Pending 'balance' row for the rest.
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
  const leftover = await loadSpawnedLeftover(
    transaction.booking_id,
    balanceIdsBefore
  );

  return {
    transaction: settled,
    booking,
    creditTransaction: creditRow,
    leftover,
  };
}
