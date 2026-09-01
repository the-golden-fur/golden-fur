import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Transaction } from '../../billing/billing.types.ts';
import type { TransactionHistoryFilters } from '../reports.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Issue #102: a plain filtered Supabase query, not a SQL function - the
 * filtering logic doesn't need to live in the database for this one (Guide
 * dev notes). All four documented filters (customer, pet, date range,
 * service type) are composable, mirroring booking.service.ts's
 * listBookings() conditional-builder pattern. petId/serviceCategory filter
 * on the joined booking, so the join only switches to !inner (excluding
 * booking-less misc-sale transactions) when one of those two is actually
 * requested - a plain left join otherwise, so misc sales still show up in
 * an unfiltered or customer/date-only search.
 */
export async function listTransactionHistory(
  filters: TransactionHistoryFilters
): Promise<Transaction[]> {
  // payment_status + the pricing snapshot let the transaction-history pages
  // work out a booking's outstanding balance (for the customer/staff
  // "add a balance payment" action) without a second round trip.
  const bookingColumns =
    'pet_id, service_category, payment_status, total_price, discount_amount, promo_amount';
  const needsBookingJoin = Boolean(filters.petId || filters.serviceCategory);
  const bookingsSelect = needsBookingJoin
    ? `bookings!inner(${bookingColumns})`
    : `bookings(${bookingColumns})`;

  let query = supabase.from('transactions').select(`*, ${bookingsSelect}`);

  if (filters.branchId) {
    query = query.eq('branch_id', filters.branchId);
  }

  if (filters.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }

  if (filters.dateFrom) {
    query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`);
  }

  if (filters.dateTo) {
    const exclusiveEnd = new Date(
      new Date(`${filters.dateTo}T00:00:00.000Z`).getTime() +
        24 * 60 * 60 * 1000
    ).toISOString();

    query = query.lt('created_at', exclusiveEnd);
  }

  if (filters.petId) {
    query = query.eq('bookings.pet_id', filters.petId);
  }

  if (filters.serviceCategory) {
    query = query.eq('bookings.service_category', filters.serviceCategory);
  }

  if (filters.transactionType) {
    query = query.eq('transaction_type', filters.transactionType);
  }

  if (filters.paymentChoice) {
    query = query.eq('payment_choice', filters.paymentChoice);
  }

  const { data, error } = await query.order('created_at', {
    ascending: false,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Transaction[];
}
