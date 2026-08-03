import type {
  Booking,
  BookingStatus,
  CancelBookingPayload,
  CancellationResult,
  CreateBookingPayload,
  ListBookingsFilters,
  OperatingWindow,
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
} from '../../maintenance/maintenance.types';

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

  const result = await parseBody<DayAvailability>(response);
  return {
    data: result.data
      ? { slots: result.data.slots, window: result.data.window }
      : null,
    error: result.error,
  };
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

/**
 * Manual status-advance actions (booking-status revision): Start (Pending
 * -> In Progress), Complete (In Progress -> Completed, or straight to Paid
 * when an online payment was already confirmed), Mark as Paid (Completed ->
 * Paid, for a pay-at-counter booking). No-show has no endpoint - it's a
 * lazy transition the server applies whenever a booking is read.
 */
async function postBookingAction(
  bookingId: string,
  action: 'start' | 'complete' | 'mark-paid',
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

export function markBookingPaid(bookingId: string, accessToken: string) {
  return postBookingAction(bookingId, 'mark-paid', accessToken);
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
