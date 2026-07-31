import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { ServiceCategory } from '../../booking/booking.types.ts';
import type { DraftLineItem } from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface BookingForBilling {
  id: string;
  customer_id: string;
  branch_id: string;
  branchName: string;
  service_category: ServiceCategory;
  service_id: string | null;
  package_id: string | null;
  status: string;
  total_price: number;
}

/**
 * Issue #84: checkout can only run against a booking whose underlying
 * service already completed (FINISHED_BOOKING_STATUSES in booking.types.ts
 * - 'Completed' or 'Paid'), matching Modules-Features' "cannot run without a
 * service being completed."
 */
export async function getBookingForBilling(
  bookingId: string
): Promise<BookingForBilling> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, branch_id, service_category, service_id, package_id, status, total_price, branches!inner(name)'
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Booking not found');

  const status = (data as unknown as { status: string }).status;
  if (status !== 'Completed' && status !== 'Paid') {
    throwWithStatus(
      409,
      `A ${status} booking's service has not completed yet - checkout is not available`
    );
  }

  const branchName = (data as unknown as { branches: { name: string } })
    .branches.name;

  return {
    id: data.id,
    customer_id: data.customer_id,
    branch_id: data.branch_id,
    branchName,
    service_category: data.service_category,
    service_id: data.service_id,
    package_id: data.package_id,
    status,
    total_price: Number(data.total_price),
  };
}

async function resolveServiceOrPackageDescription(
  booking: BookingForBilling
): Promise<string> {
  if (booking.service_id) {
    const { data } = await supabase
      .from('services')
      .select('name')
      .eq('id', booking.service_id)
      .maybeSingle();
    return data?.name ?? 'Service';
  }

  if (booking.package_id) {
    const { data } = await supabase
      .from('packages')
      .select('name')
      .eq('id', booking.package_id)
      .maybeSingle();
    return data?.name ?? 'Package';
  }

  return 'Service';
}

async function getGroomingLineItems(
  booking: BookingForBilling
): Promise<DraftLineItem[]> {
  const description = await resolveServiceOrPackageDescription(booking);
  const serviceLine: DraftLineItem = {
    line_item_type: 'service',
    reference_id: booking.service_id ?? booking.package_id,
    description,
    quantity: 1,
    unit_price: booking.total_price,
    line_total: booking.total_price,
  };

  const { data: addons, error } = await supabase
    .from('booking_addons')
    .select('service_id, price_at_booking, services(name)')
    .eq('booking_id', booking.id);

  if (error) throwWithStatus(400, error.message);

  const addonLines: DraftLineItem[] = (
    (addons ?? []) as unknown as Array<{
      service_id: string;
      price_at_booking: number;
      services: { name: string }[] | { name: string } | null;
    }>
  ).map((addon) => {
    const serviceName = Array.isArray(addon.services)
      ? addon.services[0]?.name
      : addon.services?.name;

    return {
      line_item_type: 'addon',
      reference_id: addon.service_id,
      description: serviceName ?? 'Add-on',
      quantity: 1,
      unit_price: Number(addon.price_at_booking),
      line_total: Number(addon.price_at_booking),
    };
  });

  return [serviceLine, ...addonLines];
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
      reference_id: booking.service_id ?? booking.package_id,
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
      return getGroomingLineItems(booking);
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
