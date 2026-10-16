import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../../shared/auth/api/supabaseAuth.api.ts';
import type {
  PetServiceHistoryEntry,
  PetServiceHistoryPayment,
} from '../pet.types.ts';

/** Past bookings only - the service happened or definitively didn't.
 * Pending/Late/In Progress are still upcoming/ongoing and belong on the
 * Bookings page, not in history. */
export const SERVICE_HISTORY_STATUSES: readonly PetServiceHistoryEntry['status'][] =
  ['Completed', 'Cancelled', 'No-show'];

/** Only money actually taken prints as a receipt - an unpaid charge would
 * print as "Payment Due", which isn't proof of payment. */
const PAID_PAYMENT_STATUSES: readonly PetServiceHistoryPayment['payment_status'][] =
  ['Partially Paid', 'Fully Paid'];

interface ListPetServiceHistoryParams {
  requesterId: string;
  petId: string;
}

interface ServiceHistoryRow {
  id: string;
  service_category: PetServiceHistoryEntry['service_category'];
  status: PetServiceHistoryEntry['status'];
  scheduled_start: string;
  completed_at: string | null;
  booking_group_id: string | null;
  total_price: number | string;
  cancellation_reason: string | null;
  branches: { name: string } | null;
  assigned_staff: { display_name: string | null } | null;
  booking_items: Array<{
    services: { name: string } | null;
    packages: { name: string } | null;
  }> | null;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Owning customer or any staff role - same rule as the pet's consultation
 * results/prescriptions (consultation.service.ts's
 * assertCanReadPetClinicalHistory). Returns the owner's id. */
async function assertCanRead(
  requesterId: string,
  petId: string
): Promise<string> {
  const { data: pet } = await supabase
    .from('pets')
    .select('customer_id')
    .eq('id', petId)
    .maybeSingle();

  if (!pet) {
    throwWithStatus(404, 'Pet not found');
  }

  if (pet.customer_id === requesterId) return pet.customer_id;

  const role = await getStaffRoleOrNull(requesterId);
  if (!role) throwWithStatus(403, 'Forbidden');

  return pet.customer_id;
}

/** The paid transactions behind these bookings - each booking's own, plus
 * any multi-booking checkout that covered it (booking_group_id) - with the
 * owner's name, since the receipt prints it. */
async function listPaidPayments(
  rows: ServiceHistoryRow[],
  ownerId: string
): Promise<PetServiceHistoryPayment[]> {
  if (rows.length === 0) return [];

  const bookingIds = rows.map((row) => row.id);
  const groupIds = [
    ...new Set(
      rows
        .map((row) => row.booking_group_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const matches = [`booking_id.in.(${bookingIds.join(',')})`];
  if (groupIds.length > 0) {
    matches.push(`booking_group_id.in.(${groupIds.join(',')})`);
  }

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, booking_id, booking_group_id, branch_id, transaction_type, payment_method, payment_status, payment_choice, total_amount, misc_sale_description, created_at, bookings(service_category, pets(name)), transaction_line_items(description, quantity, unit_price, line_total)'
    )
    .or(matches.join(','))
    .in('payment_status', PAID_PAYMENT_STATUSES)
    .order('created_at', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const payments = (data ?? []) as unknown as Array<
    Omit<PetServiceHistoryPayment, 'customer_name'>
  >;
  if (payments.length === 0) return [];

  const { data: owner } = await supabase
    .from('customer_profiles')
    .select('full_name')
    .eq('id', ownerId)
    .maybeSingle();

  return payments.map((payment) => ({
    ...payment,
    total_amount: Number(payment.total_amount),
    transaction_line_items: payment.transaction_line_items ?? [],
    customer_name: owner?.full_name ?? null,
  }));
}

export async function listPetServiceHistory({
  requesterId,
  petId,
}: ListPetServiceHistoryParams): Promise<PetServiceHistoryEntry[]> {
  const ownerId = await assertCanRead(requesterId, petId);

  // bookings has more than one FK to staff_profiles, so the embed names the
  // assigned-staff one explicitly.
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, service_category, status, scheduled_start, completed_at, booking_group_id, total_price, cancellation_reason, branches(name), assigned_staff:staff_profiles!bookings_assigned_staff_id_fkey(display_name), booking_items(services(name), packages(name))'
    )
    .eq('pet_id', petId)
    .in('status', SERVICE_HISTORY_STATUSES)
    .order('scheduled_start', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  const rows = (data ?? []) as unknown as ServiceHistoryRow[];
  const payments = await listPaidPayments(rows, ownerId);

  return rows.map((row) => ({
    booking_id: row.id,
    date: row.completed_at ?? row.scheduled_start,
    service_category: row.service_category,
    status: row.status,
    items: (row.booking_items ?? [])
      .map((item) => item.services?.name ?? item.packages?.name ?? null)
      .filter((name): name is string => Boolean(name)),
    branch_name: row.branches?.name ?? null,
    staff_name: row.assigned_staff?.display_name ?? null,
    total_price: Number(row.total_price),
    cancellation_reason: row.cancellation_reason,
    payments: payments.filter(
      (payment) =>
        payment.booking_id === row.id ||
        (row.booking_group_id !== null &&
          payment.booking_group_id === row.booking_group_id)
    ),
  }));
}
