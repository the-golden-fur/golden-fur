import type {
  Booking,
  BookingStatus,
  CagePickerOptionsResult,
  CancelBookingPayload,
  CancellationResult,
  CreateBookingPayload,
  DownpaymentType,
  ListBookingsFilters,
  OperatingWindow,
  PayForBookingPayload,
  PayForBookingResult,
  PetBookingConflict,
  PolicyConfiguration,
  RescheduleBookingPayload,
  RescheduleResult,
  SlotAvailability,
  StaffPickerOptionsResult,
} from '../booking.types';
import type {
  Package,
  Promo,
  Service,
  ServiceType,
} from '../../maintenance/maintenance.types';
import { getSupabaseClient } from '../../../shared/auth/api/auth.api';

interface BookingApiResult<T> {
  data: T | null;
  error: string | null;
}

// booking.routes.ts is mounted at the server root (not under /auth), same
// as maintenance.routes.ts and discounts.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<BookingApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return { 'Content-Type': 'application/json', ...authHeaders(accessToken) };
}

export async function createBooking(
  accessToken: string,
  payload: CreateBookingPayload
): Promise<BookingApiResult<Booking>> {
  const response = await fetch(`${API_BASE_URL}/bookings`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ booking: Booking }>(response);
  return { data: result.data?.booking ?? null, error: result.error };
}

export async function getBooking(
  bookingId: string,
  accessToken: string
): Promise<BookingApiResult<Booking>> {
  const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ booking: Booking }>(response);
  return { data: result.data?.booking ?? null, error: result.error };
}

export async function listBookings(
  accessToken: string,
  filters: ListBookingsFilters = {}
): Promise<BookingApiResult<Booking[]>> {
  const params = new URLSearchParams();

  if (filters.branchId) params.set('branch_id', filters.branchId);
  if (filters.date) params.set('date', filters.date);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.serviceCategory) {
    params.set('service_category', filters.serviceCategory);
  }
  if (filters.status) params.set('status', filters.status);
  if (filters.paymentStatus)
    params.set('payment_status', filters.paymentStatus);
  if (filters.assignedStaffId) {
    params.set('assigned_staff_id', filters.assignedStaffId);
  }
  if (filters.excludeUnpaidDownpayment) {
    params.set('exclude_unpaid_downpayment', 'true');
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/bookings${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ bookings: Booking[] }>(response);
  return { data: result.data?.bookings ?? null, error: result.error };
}

export interface AvailabilityQuery {
  branchId: string;
  serviceCategory: string;
  /** YYYY-MM-DD */
  date: string;
  slotDurationMinutes: number;
  petWeightClass?: string;
}

export interface DayAvailability {
  slots: SlotAvailability[];
  window: OperatingWindow | null;
  /** Minimum-notice lead time (policy_configurations.notice_period_days when
   * enforcement is on, else 0): the Slot Picker floors its calendar this many
   * days out so the browsable range opens on the first bookable day. */
  minNoticeDays: number;
}

export async function getDayAvailability(
  accessToken: string,
  query: AvailabilityQuery
): Promise<BookingApiResult<DayAvailability>> {
  const params = new URLSearchParams({
    branch_id: query.branchId,
    service_category: query.serviceCategory,
    date: query.date,
    slot_duration_minutes: String(query.slotDurationMinutes),
  });

  if (query.petWeightClass) {
    params.set('pet_weight_class', query.petWeightClass);
  }

  const response = await fetch(
    `${API_BASE_URL}/bookings/availability?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{
    slots: SlotAvailability[];
    window: OperatingWindow | null;
    min_notice_days?: number;
  }>(response);
  return {
    data: result.data
      ? {
          slots: result.data.slots,
          window: result.data.window,
          minNoticeDays: result.data.min_notice_days ?? 0,
        }
      : null,
    error: result.error,
  };
}

export interface NextAvailableSlotQuery {
  branchId: string;
  serviceCategory: string;
  /** YYYY-MM-DD - search starts here (inclusive). */
  fromDate: string;
  slotDurationMinutes: number;
  petWeightClass?: string;
  lookaheadDays?: number;
}

export interface NextAvailableSlot {
  date: string;
  earliestSlot: { start: string; end: string };
}

/** #22: "fully booked" warning support - the earliest available day/slot
 * looking forward from fromDate, so the booking flow can warn right after
 * service selection instead of only once the customer reaches the Slot
 * Picker. null = nothing available within the lookahead window. */
export async function getNextAvailableSlot(
  accessToken: string,
  query: NextAvailableSlotQuery
): Promise<BookingApiResult<NextAvailableSlot | null>> {
  const params = new URLSearchParams({
    branch_id: query.branchId,
    service_category: query.serviceCategory,
    from_date: query.fromDate,
    slot_duration_minutes: String(query.slotDurationMinutes),
  });

  if (query.petWeightClass) {
    params.set('pet_weight_class', query.petWeightClass);
  }
  if (query.lookaheadDays) {
    params.set('lookahead_days', String(query.lookaheadDays));
  }

  const response = await fetch(
    `${API_BASE_URL}/bookings/availability/next-slot?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ next: NextAvailableSlot | null }>(response);
  return { data: result.data ? result.data.next : null, error: result.error };
}

export interface BookingCatalog {
  services: Service[];
  packages: Package[];
  promos: Promo[];
}

export interface CatalogQuery {
  branchId: string;
  category?: string;
}

/**
 * Epic A's /maintenance/* endpoints (services/packages/promos) are staff-
 * only at both the Express role gate and the underlying RLS policy - there
 * is no direct-fetch or direct-Supabase-read path available to a customer
 * session. This calls booking's own read-through instead (#55/#58
 * supporting infra, server/src/features/booking/services/catalog.service.ts).
 */
export async function getBookingCatalog(
  accessToken: string,
  query: CatalogQuery
): Promise<BookingApiResult<BookingCatalog>> {
  const params = new URLSearchParams({ branch_id: query.branchId });

  if (query.category) {
    params.set('category', query.category);
  }

  const response = await fetch(
    `${API_BASE_URL}/bookings/catalog?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<BookingCatalog>(response);
}

export interface StaffPickerQuery {
  branchId: string;
  serviceCategory: string;
  scheduledStart: string;
  scheduledEnd: string;
}

export async function getStaffPickerOptions(
  accessToken: string,
  query: StaffPickerQuery
): Promise<BookingApiResult<StaffPickerOptionsResult>> {
  const params = new URLSearchParams({
    branch_id: query.branchId,
    service_category: query.serviceCategory,
    scheduled_start: query.scheduledStart,
    scheduled_end: query.scheduledEnd,
  });

  const response = await fetch(
    `${API_BASE_URL}/bookings/staff-picker?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<StaffPickerOptionsResult>(response);
}

/**
 * Custom change: Service Types addendum - no Express endpoint here (unlike
 * maintenance.api.ts's staff-only listServiceTypes CRUD surface), same
 * pattern as that file's own listBranches/customer.api.ts's listBreeds:
 * service_types RLS grants SELECT to every authenticated user, so both the
 * customer flow and receptionist walk-in mode read it directly via the
 * Supabase client. Used to drive the Service Type step's active/inactive
 * filtering and customer-facing labels.
 */
export async function listServiceTypes(): Promise<
  BookingApiResult<ServiceType[]>
> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { data: null, error: 'Supabase client is not configured.' };
  }

  const { data, error } = await supabase
    .from('service_types')
    .select('*')
    .order('created_at');

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as ServiceType[], error: null };
}

/** Custom change: Cage Picker addendum - mirrors getStaffPickerOptions. */
export async function getCagePickerOptions(
  accessToken: string,
  branchId: string
): Promise<BookingApiResult<CagePickerOptionsResult>> {
  const params = new URLSearchParams({ branch_id: branchId });

  const response = await fetch(
    `${API_BASE_URL}/bookings/cage-picker?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CagePickerOptionsResult>(response);
}

export async function rescheduleBooking(
  bookingId: string,
  accessToken: string,
  payload: RescheduleBookingPayload
): Promise<BookingApiResult<RescheduleResult>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/reschedule`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<RescheduleResult>(response);
}

export async function cancelBooking(
  bookingId: string,
  accessToken: string,
  payload: CancelBookingPayload = {}
): Promise<BookingApiResult<CancellationResult>> {
  const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CancellationResult>(response);
}

/** Customer self-service Pay button - initiates a real PayMongo checkout
 * (GCash/Maya) for either the full remaining amount or just the catalog
 * downpayment, returning a checkoutUrl to redirect the customer to. */
export async function payForBooking(
  bookingId: string,
  accessToken: string,
  payload: PayForBookingPayload
): Promise<BookingApiResult<PayForBookingResult>> {
  const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/pay`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<PayForBookingResult>(response);
}

/** Custom change: duplicate-booking prevention - pet ids that currently
 * have an unresolved Hotel/Daycare booking, so the booking flow's pet-
 * selection step can disable them. */
export async function getPetBookingConflicts(
  customerId: string,
  accessToken: string
): Promise<BookingApiResult<PetBookingConflict[]>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/pet-conflicts?customer_id=${customerId}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ conflicts: PetBookingConflict[] }>(response);
  return { data: result.data?.conflicts ?? null, error: result.error };
}

/** Whether the customer-facing Pay button should be enabled for a branch -
 * see isOnlinePaymentsEnabled's own doc comment server-side. */
export async function getOnlinePaymentsStatus(
  branchId: string,
  accessToken: string
): Promise<BookingApiResult<{ online_payments_enabled: boolean }>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/online-payments-status?branch_id=${branchId}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<{ online_payments_enabled: boolean }>(response);
}

export interface DownpaymentStatus {
  downpayment_enabled: boolean;
  downpayment_type: DownpaymentType | null;
  downpayment_amount: number | null;
}

/** Per-transaction downpayment config for a branch - see
 * resolveDownpaymentPolicy's own doc comment server-side. Used by the
 * customer booking flow to preview the amount before submitting. */
export async function getDownpaymentStatus(
  branchId: string,
  accessToken: string
): Promise<BookingApiResult<DownpaymentStatus>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/downpayment-status?branch_id=${branchId}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<DownpaymentStatus>(response);
}

/**
 * Manual status-advance actions: Start (Pending -> In Progress), Complete
 * (In Progress -> Completed; also auto-advances payment_stage to Paid when
 * an online payment was already confirmed - see completeBooking in
 * booking.service.ts). No-show has no endpoint - it's a lazy transition the
 * server applies whenever a booking is read. Payment ("Mark as Paid") is a
 * separate action on the payment_stage track - see advancePaymentStatus
 * below.
 */
async function postBookingAction(
  bookingId: string,
  action: 'start' | 'complete',
  accessToken: string
): Promise<BookingApiResult<Booking>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/${action}`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ booking: Booking }>(response);
  return { data: result.data?.booking ?? null, error: result.error };
}

export function startBooking(bookingId: string, accessToken: string) {
  return postBookingAction(bookingId, 'start', accessToken);
}

export function completeBooking(bookingId: string, accessToken: string) {
  return postBookingAction(bookingId, 'complete', accessToken);
}

/** Admin/Superadmin-only direct status set (forward or backward) - see
 * BOOKING_STATUS_OVERRIDE_ROLES server-side. */
export async function overrideBookingStatus(
  bookingId: string,
  status: BookingStatus,
  accessToken: string
): Promise<BookingApiResult<Booking>> {
  const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/status`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ booking: Booking }>(response);
  return { data: result.data?.booking ?? null, error: result.error };
}

// Payment is recorded per transaction on the Transactions page now
// (billing.api.ts: recordTransactionPayment / addBookingPayment /
// payTransactionWithCredit). The old /bookings/:id/payment-stage endpoints
// are gone with the Payments Queue.

export async function getBookingPolicy(
  accessToken: string
): Promise<BookingApiResult<PolicyConfiguration[]>> {
  const response = await fetch(`${API_BASE_URL}/bookings/policy`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ policies: PolicyConfiguration[] }>(response);
  return { data: result.data?.policies ?? null, error: result.error };
}
