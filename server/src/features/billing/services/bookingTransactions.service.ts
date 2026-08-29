import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Transaction } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Down-payment slot gate (§6): every payment recorded against one booking,
 * oldest first, for the Payments Queue's per-row "View payments" panel -
 * date, amount, method, status (Pending / Partially Paid / Fully Paid),
 * and whether it was a down payment or a full payment. Staff-only
 * (route-gated to BILLING_STAFF_ROLES); a plain read, no writes.
 *
 * Distinct from listTransactionHistory (reports/M14-03), which is the
 * global cross-booking browser - this is the single-booking drill-down the
 * cashier needs while working a row.
 */
export async function listBookingTransactions(
  bookingId: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Transaction[];
}
