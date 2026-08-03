import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { ServiceCategory } from '../../booking/booking.types.ts';
import type { DraftLineItem } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface BookingLineItem {
  id: string;
  service_id: string | null;
  package_id: string | null;
  price_at_booking: number;
  description: string;
}

export interface BookingForBilling {
  id: string;
  customer_id: string;
  branch_id: string;
  branchName: string;
  service_category: ServiceCategory;
  items: BookingLineItem[];
  status: string;
  total_price: number;
  payment_method: string | null;
  /** Locked in at booking creation (staff-only, Cash-only discount; any-
   * payment-method promo) - see resolveDiscountAndPromo in
   * booking.service.ts. null/0 when nothing was selected at booking time,
   * in which case checkout falls back to auto-evaluating scope matches
   * itself (evaluateDiscounts/evaluatePromos). */
  selected_discount_id: string | null;
  selected_discount_name: string | null;
  discount_amount: number;
  selected_promo_id: string | null;
  selected_promo_name: string | null;
  promo_amount: number;
}

/**
 * Issue #84: checkout can only run against a booking whose underlying
 * service already completed (FINISHED_BOOKING_STATUSES in booking.types.ts
 * - 'Completed'), matching Modules-Features' "cannot run without a service
 * being completed."
 */
export async function getBookingForBilling(
  bookingId: string
): Promise<BookingForBilling> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, branch_id, service_category, status, total_price, payment_method, selected_discount_id, discount_amount, selected_promo_id, promo_amount, branches!inner(name), discounts(name), promos(name), booking_items(id, service_id, package_id, price_at_booking, services(name), packages(name))'
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Booking not found');

  const status = (data as unknown as { status: string }).status;
  if (status !== 'Completed') {
    throwWithStatus(
      409,
      `A ${status} booking's service has not completed yet - checkout is not available`
    );
  }

  const branchName = (data as unknown as { branches: { name: string } })
    .branches.name;

  const rawItems = (
    data as unknown as {
      booking_items: Array<{
        id: string;
        service_id: string | null;
        package_id: string | null;
        price_at_booking: number;
        services: { name: string } | { name: string }[] | null;
        packages: { name: string } | { name: string }[] | null;
      }>;
    }
  ).booking_items;

  const items: BookingLineItem[] = rawItems.map((item) => {
    const serviceName = Array.isArray(item.services)
      ? item.services[0]?.name
      : item.services?.name;
    const packageName = Array.isArray(item.packages)
      ? item.packages[0]?.name
      : item.packages?.name;

    return {
      id: item.id,
      service_id: item.service_id,
      package_id: item.package_id,
      price_at_booking: Number(item.price_at_booking),
      description: serviceName ?? packageName ?? 'Item',
    };
  });

  const raw = data as unknown as {
    payment_method: string | null;
    selected_discount_id: string | null;
    discount_amount: number;
    selected_promo_id: string | null;
    promo_amount: number;
    discounts: { name: string } | { name: string }[] | null;
    promos: { name: string } | { name: string }[] | null;
  };
  const discountName = Array.isArray(raw.discounts)
    ? raw.discounts[0]?.name
    : raw.discounts?.name;
  const promoName = Array.isArray(raw.promos)
    ? raw.promos[0]?.name
    : raw.promos?.name;

  return {
    id: data.id,
    customer_id: data.customer_id,
    branch_id: data.branch_id,
    branchName,
    service_category: data.service_category,
    items,
    status,
    total_price: Number(data.total_price),
    payment_method: raw.payment_method,
    selected_discount_id: raw.selected_discount_id,
    selected_discount_name: discountName ?? null,
    discount_amount: Number(raw.discount_amount ?? 0),
    selected_promo_id: raw.selected_promo_id,
    selected_promo_name: promoName ?? null,
    promo_amount: Number(raw.promo_amount ?? 0),
  };
}

/**
 * Multi-item bookings revision: every selected item - whether it would once
 * have been the "base" service/package or one of the old Grooming-only
 * add-ons - is now just a booking_items row, so this is a straight map
 * rather than "one service line + a separate add-ons query". line_item_type
 * stays 'service' for all of them; 'addon' remains a valid DraftLineItem
 * value for historical rows but is no longer produced going forward.
 *
 * Shared by Grooming and Misc - neither category has any billing logic
 * beyond "list what was selected", unlike Hotel/Daycare/Veterinary below.
 */
async function getItemBasedLineItems(
  booking: BookingForBilling
): Promise<DraftLineItem[]> {
  return booking.items.map((item) => ({
    line_item_type: 'service',
    reference_id: item.service_id ?? item.package_id,
    description: item.description,
    quantity: 1,
    unit_price: item.price_at_booking,
    line_total: item.price_at_booking,
  }));
}

/**
 * Mirrors checkout.service.ts's checkOutHotelStay() reconciliation
 * (total_price - downpayment_amount + extension_fee + supplied_items_charge)
 * as separate signed lines rather than one pre-netted figure, so the
 * cashier checkout screen (#86) can show each component individually -
 * SUM(line_total) still reproduces the same remaining-balance figure.
 */
async function getHotelLineItems(
  booking: BookingForBilling
): Promise<DraftLineItem[]> {
  const { data: stay, error } = await supabase
    .from('hotel_stays')
    .select('downpayment_amount, extension_fee, supplied_items_charge')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!stay) throwWithStatus(404, 'Hotel stay not found for this booking');

  const downpayment = Number(stay.downpayment_amount);

  const lines: DraftLineItem[] = [
    {
      line_item_type: 'service',
      // Best-effort single pointer for a Hotel booking, which always bills
      // one aggregate "Hotel stay" line off total_price regardless of how
      // many items were selected (multi-item Hotel bookings aren't itemized
      // on the bill - not a bug, per this billing surface's existing
      // per-stay-not-per-item design).
      reference_id:
        booking.items[0]?.service_id ?? booking.items[0]?.package_id ?? null,
      description: 'Hotel stay',
      quantity: 1,
      unit_price: booking.total_price,
      line_total: booking.total_price,
    },
    {
      line_item_type: 'discount',
      reference_id: null,
      description: 'Downpayment already collected',
      quantity: 1,
      unit_price: -downpayment,
      line_total: -downpayment,
    },
  ];

  if (stay.extension_fee !== null) {
    const fee = Number(stay.extension_fee);
    lines.push({
      line_item_type: 'service',
      reference_id: null,
      description: 'Late checkout extension fee',
      quantity: 1,
      unit_price: fee,
      line_total: fee,
    });
  }

  if (stay.supplied_items_charge !== null) {
    const charge = Number(stay.supplied_items_charge);
    lines.push({
      line_item_type: 'addon',
      reference_id: null,
      description: 'Hotel-supplied food/medication',
      quantity: 1,
      unit_price: charge,
      line_total: charge,
    });
  }

  return lines;
}

/**
 * Daycare walk-ins (booking_id IS NULL - daycare_sessions allows this) have
 * no booking to key checkout off of at all, so they are out of scope for
 * POST /billing/checkout, which always requires a booking_id - a walk-in
 * daycare charge is out of scope for this epic's checkout surface pending a
 * dedicated "checkout a walk-in session" entry point.
 */
async function getDaycareLineItems(
  booking: BookingForBilling
): Promise<DraftLineItem[]> {
  const { data: session, error } = await supabase
    .from('daycare_sessions')
    .select('computed_charge')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!session || session.computed_charge === null) {
    throwWithStatus(409, 'This daycare session has not been checked out yet');
  }

  return [
    {
      line_item_type: 'service',
      reference_id: null,
      description: 'Daycare session',
      quantity: 1,
      unit_price: Number(session.computed_charge),
      line_total: Number(session.computed_charge),
    },
  ];
}

async function getVeterinaryLineItems(
  booking: BookingForBilling
): Promise<DraftLineItem[]> {
  const { data: consultation, error } = await supabase
    .from('consultations')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!consultation) {
    throwWithStatus(404, 'Consultation not found for this booking');
  }

  const { data: items, error: itemsError } = await supabase
    .from('consultation_line_items')
    .select('description, amount')
    .eq('consultation_id', consultation.id);

  if (itemsError) throwWithStatus(400, itemsError.message);

  return ((items ?? []) as Array<{ description: string; amount: number }>).map(
    (item) => ({
      line_item_type: 'service',
      reference_id: consultation.id,
      description: item.description,
      quantity: 1,
      unit_price: Number(item.amount),
      line_total: Number(item.amount),
    })
  );
}

/** Dispatches to the right M04/M05/M06/M07 source by
 * bookings.service_category (Issue #84 dev notes). */
export async function getServiceLineItems(
  booking: BookingForBilling
): Promise<DraftLineItem[]> {
  switch (booking.service_category) {
    case 'Grooming':
    case 'Misc':
      return getItemBasedLineItems(booking);
    case 'Hotel':
      return getHotelLineItems(booking);
    case 'Daycare':
      return getDaycareLineItems(booking);
    case 'Veterinary':
      return getVeterinaryLineItems(booking);
    default:
      throwWithStatus(
        400,
        `Unsupported service category: ${booking.service_category}`
      );
  }
}
