import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffBranch } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  assertMinimumPayable,
  resolvePromoAmount,
} from '../../booking/services/booking.service.ts';
import { getPromoById } from '../../maintenance/services/promos.service.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const CLOSED_BOOKING_STATUSES = ['Cancelled', 'No-show'];
/** A part of a larger bill - the promo belongs on the whole price. */
const PART_PAYMENT_CHOICES = ['downpayment', 'balance'];

interface BillContext {
  transactionId: string;
  bookingId: string;
  branchId: string;
  totalPrice: number;
  billTotal: number;
  items: Array<{ service_id?: string | null; package_id?: string | null }>;
}

/** The bill, when a promo can be added to it, else why not. "Unpaid" means
 * this is the booking's only payment row - any other one, settled or not,
 * means the money has already been split up. */
async function loadBill(
  requesterId: string,
  transactionId: string
): Promise<{ bill: BillContext | null; reason: string | null }> {
  const { data: transaction, error } = await supabase
    .from('transactions')
    .select(
      'id, booking_id, branch_id, transaction_type, payment_status, payment_choice, total_amount'
    )
    .eq('id', transactionId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!transaction) throwWithStatus(404, 'Transaction not found');

  const { data: staff } = await getStaffBranch(requesterId);

  if (
    staff?.role !== 'Superadmin' &&
    staff?.branch_id !== transaction.branch_id
  ) {
    throwWithStatus(403, 'This transaction belongs to another branch');
  }

  const refuse = (reason: string) => ({ bill: null, reason });

  if (
    !transaction.booking_id ||
    transaction.transaction_type !== 'booking_payment'
  ) {
    return refuse('Promos can only be added to a single booking bill.');
  }
  if (transaction.payment_status !== 'Pending') {
    return refuse('This bill is already paid.');
  }
  if (PART_PAYMENT_CHOICES.includes(transaction.payment_choice)) {
    return refuse('Promos can only be added to a full, unpaid bill.');
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(
      'id, status, total_price, discount_amount, promo_amount, awaiting_assessment, booking_items(service_id, package_id)'
    )
    .eq('id', transaction.booking_id)
    .maybeSingle();

  if (bookingError) throwWithStatus(400, bookingError.message);
  if (!booking) throwWithStatus(404, 'Booking not found');

  if (CLOSED_BOOKING_STATUSES.includes(booking.status)) {
    return refuse('This booking was cancelled.');
  }
  if (booking.awaiting_assessment) {
    return refuse("This pet hasn't been assessed yet.");
  }
  if (Number(booking.discount_amount) > 0 || Number(booking.promo_amount) > 0) {
    return refuse('This booking already has a discount or promo.');
  }

  const [{ data: selections }, { data: otherPayments }] = await Promise.all([
    supabase
      .from('booking_promo_selections')
      .select('id')
      .eq('booking_id', booking.id),
    supabase
      .from('transactions')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('transaction_type', 'booking_payment')
      .neq('id', transactionId),
  ]);

  if ((selections ?? []).length > 0) {
    return refuse('This booking already has a discount or promo.');
  }
  if ((otherPayments ?? []).length > 0) {
    return refuse('Promos can only be added before any payment is made.');
  }

  return {
    bill: {
      transactionId,
      bookingId: booking.id,
      branchId: transaction.branch_id,
      totalPrice: Number(booking.total_price),
      billTotal: Number(transaction.total_amount),
      items: (booking.booking_items ?? []) as BillContext['items'],
    },
    reason: null,
  };
}

/** What the promo takes off this bill - the same rules as at booking, plus
 * that something must be left to pay. Throws a 400 saying why not. */
function resolveCounterPromoAmount(
  promo: Awaited<ReturnType<typeof getPromoById>>,
  bill: BillContext
): number {
  const amount = resolvePromoAmount(promo, {
    branchId: bill.branchId,
    items: bill.items,
    totalPrice: bill.totalPrice,
  });

  assertMinimumPayable(bill.totalPrice, 0, amount);

  if (amount <= 0 || amount >= bill.billTotal) {
    throwWithStatus(400, `Promo "${promo.name}" can't be used on this bill`);
  }

  return amount;
}

export interface CounterPromoOption {
  id: string;
  name: string;
  amount: number;
}

export async function listCounterPromoOptions({
  requesterId,
  transactionId,
}: {
  requesterId: string;
  transactionId: string;
}): Promise<{ promos: CounterPromoOption[]; reason: string | null }> {
  const { bill, reason } = await loadBill(requesterId, transactionId);
  if (!bill) return { promos: [], reason };

  const { data, error } = await supabase
    .from('promos')
    .select('id')
    .eq('is_active', true);

  if (error) throwWithStatus(400, error.message);

  const promos = await Promise.all(
    ((data ?? []) as Array<{ id: string }>).map(({ id }) => getPromoById(id))
  );
  const options: CounterPromoOption[] = [];

  for (const promo of promos) {
    try {
      options.push({
        id: promo.id,
        name: promo.name,
        amount: resolveCounterPromoAmount(promo, bill),
      });
    } catch (optionError) {
      // Doesn't fit this bill, so it just isn't offered.
      if ((optionError as { statusCode?: number }).statusCode !== 400) {
        throw optionError;
      }
    }
  }

  return { promos: options, reason: null };
}

/**
 * Takes the promo off the bill, then runs the payment. The bill must already
 * show the lower total when the payment reads it, so the two can't be
 * reversed - a payment that fails puts the promo back, and the bill is left
 * as it was.
 */
export async function withCounterPromo<T>(
  {
    requesterId,
    transactionId,
    promoId,
  }: { requesterId: string; transactionId: string; promoId?: string },
  pay: () => Promise<T>
): Promise<T> {
  if (!promoId) return pay();

  const { bill, reason } = await loadBill(requesterId, transactionId);
  if (!bill) throwWithStatus(409, reason ?? "This bill can't take a promo");

  const amount = resolveCounterPromoAmount(await getPromoById(promoId), bill);

  const { data: lineId, error } = await supabase.rpc(
    'apply_promo_to_booking_payment',
    {
      p_transaction_id: transactionId,
      p_promo_id: promoId,
      p_amount: amount,
    }
  );

  if (error) throwWithStatus(409, error.message);

  try {
    return await pay();
  } catch (payError) {
    const { error: removeError } = await supabase.rpc(
      'remove_promo_from_booking_payment',
      {
        p_transaction_id: transactionId,
        p_promo_id: promoId,
        p_amount: amount,
        p_line_id: lineId,
      }
    );

    if (removeError) {
      console.error(
        `Failed to remove promo from transaction ${transactionId}:`,
        removeError.message
      );
    }

    throw payError;
  }
}
