import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { BILLING_STAFF_ROLES } from '../../billing/billing.types.ts';
import { getBookingById } from './booking.service.ts';
import type {
  Booking,
  BookingDetails,
  BookingDetailsTransaction,
  BookingGroup,
  BookingItem,
  HydratedBookingItem,
} from '../booking.types.ts';

interface GetBookingDetailsParams {
  requesterId: string;
  bookingId: string;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Settled = the customer's money is actually in (Fully or Partially Paid);
 * a Pending transaction is a charge that hasn't been collected yet. */
const SETTLED_STATUSES = new Set(['Fully Paid', 'Partially Paid']);

/** PG `numeric` columns come back from PostgREST as strings - coerce before
 * any arithmetic (the same reason formatCurrency coerces on the client). */
function num(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Like num(), but keeps a genuinely absent value absent rather than
 * flattening it to 0 (downpayment_amount is null when there's no down
 * payment, which the view renders differently from "₱0.00"). */
function numOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : num(value);
}

async function resolveItemNames(
  items: BookingItem[]
): Promise<HydratedBookingItem[]> {
  const serviceIds = items
    .map((item) => item.service_id)
    .filter((id): id is string => id !== null);
  const packageIds = items
    .map((item) => item.package_id)
    .filter((id): id is string => id !== null);

  const [services, packages] = await Promise.all([
    serviceIds.length > 0
      ? supabase.from('services').select('id, name').in('id', serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    packageIds.length > 0
      ? supabase.from('packages').select('id, name').in('id', packageIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const serviceNameById = new Map(
    (services.data ?? []).map((row) => [row.id, row.name])
  );
  const packageNameById = new Map(
    (packages.data ?? []).map((row) => [row.id, row.name])
  );

  return items.map((item) => ({
    ...item,
    name: item.service_id
      ? (serviceNameById.get(item.service_id) ?? 'Service')
      : (packageNameById.get(item.package_id ?? '') ?? 'Package'),
  }));
}

async function resolveGroup(
  groupId: string | null
): Promise<BookingGroup | null> {
  if (!groupId) return null;

  const { data, error } = await supabase
    .from('booking_groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle();

  // A grouped booking's pricing basis lives entirely on this row - falling
  // back to null here would silently under-report (member bookings carry 0
  // discount / their own share as total_price), so surface the failure.
  if (error) throwWithStatus(400, error.message);

  return (data as BookingGroup | null) ?? null;
}

/**
 * This booking's payments, or the whole group's when the booking is part of
 * a multi-booking checkout. `includePayments` is false for a staff caller
 * outside BILLING_STAFF_ROLES (Groomer / Veterinarian / Pet Assistant) -
 * they can see the booking but not its payment references / methods, the
 * same boundary GET /billing/booking/:id/transactions already enforced.
 */
async function resolveTransactions(
  booking: Booking,
  includePayments: boolean
): Promise<BookingDetailsTransaction[]> {
  if (!includePayments) return [];

  let query = supabase
    .from('transactions')
    .select(
      'id, total_amount, payment_choice, payment_status, payment_method, bank_name, credit_applied_amount, payment_reference, created_at, webhook_confirmed_at'
    )
    .eq('transaction_type', 'booking_payment')
    .order('created_at', { ascending: true });

  query = booking.booking_group_id
    ? query.or(
        `booking_id.eq.${booking.id},booking_group_id.eq.${booking.booking_group_id}`
      )
    : query.eq('booking_id', booking.id);

  const { data, error } = await query;

  // amount_paid / balance_due are derived from these rows - a swallowed
  // error would tell a fully-paid customer they still owe the full total.
  if (error) throwWithStatus(400, error.message);

  return (data as BookingDetailsTransaction[] | null) ?? [];
}

async function resolveDiscountName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase
    .from('discounts')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

async function resolvePromoName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase
    .from('promos')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

/**
 * Hydrates one booking into everything the read-only detail views render:
 * branch, pet + owner, item names, assigned staff, preferred cage,
 * discount/promo names, the shared booking-group (if any), an effective
 * pricing rollup, and the payment (transactions) list.
 *
 * Auth is delegated to getBookingById - it 403s a caller who is neither the
 * owning customer nor a staff member, and applies the same lazy read-time
 * transitions (down-payment expiry, no-show) the plain GET /bookings/:id
 * does. The payment list is additionally withheld from staff roles outside
 * BILLING_STAFF_ROLES (see resolveTransactions).
 */
export async function getBookingDetails({
  requesterId,
  bookingId,
}: GetBookingDetailsParams): Promise<BookingDetails> {
  const booking = await getBookingById({ requesterId, bookingId });

  const isOwner = booking.customer_id === requesterId;
  const staffRole = isOwner ? null : await getStaffRoleOrNull(requesterId);
  const canSeePayments =
    isOwner || (staffRole !== null && BILLING_STAFF_ROLES.includes(staffRole));

  const items = booking.booking_items ?? [];

  const [
    branchResult,
    petResult,
    ownerResult,
    hydratedItems,
    staffResult,
    cageResult,
    group,
    transactions,
  ] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name, address, contact_number')
      .eq('id', booking.branch_id)
      .maybeSingle(),
    supabase
      .from('pets')
      .select('id, name, weight_class, coat_type')
      .eq('id', booking.pet_id)
      .maybeSingle(),
    supabase
      .from('customer_profiles')
      .select('id, full_name')
      .eq('id', booking.customer_id)
      .maybeSingle(),
    resolveItemNames(items),
    booking.assigned_staff_id
      ? supabase
          .from('staff_profiles')
          .select('id, display_name')
          .eq('id', booking.assigned_staff_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    booking.preferred_cage_id
      ? supabase
          .from('cages')
          .select('id, cage_label, size')
          .eq('id', booking.preferred_cage_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    resolveGroup(booking.booking_group_id),
    resolveTransactions(booking, canSeePayments),
  ]);

  // A grouped booking carries null/0 for its own discount/promo/downpayment -
  // those live on the booking_groups row (see BookingGroup doc comment).
  const discountId = group
    ? group.selected_discount_id
    : booking.selected_discount_id;
  const promoId = group ? group.selected_promo_id : booking.selected_promo_id;

  const [discountName, promoName] = await Promise.all([
    resolveDiscountName(discountId),
    resolvePromoName(promoId),
  ]);

  const itemsSubtotal = items.reduce(
    (sum, item) => sum + num(item.price_at_booking),
    0
  );
  const amountPaid = transactions
    .filter((transaction) => SETTLED_STATUSES.has(transaction.payment_status))
    .reduce((sum, transaction) => sum + num(transaction.total_amount), 0);

  const total = num(group ? group.net_total : booking.total_price);

  return {
    booking,
    branch: (branchResult.data as BookingDetails['branch']) ?? null,
    pet: (petResult.data as BookingDetails['pet']) ?? null,
    owner: (ownerResult.data as BookingDetails['owner']) ?? null,
    items: hydratedItems,
    assigned_staff:
      (staffResult.data as BookingDetails['assigned_staff']) ?? null,
    cage: (cageResult.data as BookingDetails['cage']) ?? null,
    discount_name: discountName,
    promo_name: promoName,
    group,
    payments_visible: canSeePayments,
    pricing: {
      items_subtotal: itemsSubtotal,
      discount_amount: num(
        group ? group.discount_amount : booking.discount_amount
      ),
      promo_amount: num(group ? group.promo_amount : booking.promo_amount),
      total,
      downpayment_amount: numOrNull(
        group ? group.downpayment_amount : booking.downpayment_amount
      ),
      downpayment_required: group
        ? group.downpayment_required
        : booking.downpayment_required,
      amount_paid: amountPaid,
      balance_due: Math.max(0, total - amountPaid),
    },
    transactions,
  };
}
