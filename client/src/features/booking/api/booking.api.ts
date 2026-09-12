import type {
  Booking,
  BookingDetails,
  BookingStatus,
  CagePickerOptionsResult,
  CancelBookingPayload,
  CancellationLog,
  CancellationResult,
  ConflictedBooking,
  CreateBookingGroupPayload,
  CreateBookingGroupResult,
  CreateBookingPayload,
  CreditReviewQueueItem,
  DownpaymentType,
  ExtendHotelStayPayload,
  ExtendHotelStayResult,
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

// Multi-booking checkout ("Your bookings" list step, added right before
// Review): several otherwise-independent bookings (own pet/category/items/
// date-time/staff-or-cage each) sharing one payment/discount/promo/
// downpayment decision. Used only when the wizard's bookingsList has more
// than one entry - a list of exactly one still goes through createBooking
// above, unchanged.
export async function createBookingGroup(
  accessToken: string,
  payload: CreateBookingGroupPayload
): Promise<BookingApiResult<CreateBookingGroupResult>> {
  const response = await fetch(`${API_BASE_URL}/bookings/groups`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CreateBookingGroupResult>(response);
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

/**
 * Fully-hydrated single booking for the read-only "View details" surfaces
 * (BookingDetailsModal, BookingDetailsPage) - GET /bookings/:id/details
 * resolves branch/pet/staff/cage/item-names/discount-promo/payments
 * server-side, so a customer session gets them without hitting the
 * staff-only maintenance/billing endpoints.
 */
export async function getBookingDetails(
  bookingId: string,
  accessToken: string
): Promise<BookingApiResult<BookingDetails>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/details`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ details: BookingDetails }>(response);
  return { data: result.data?.details ?? null, error: result.error };
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
  /** Which notice-period floor to apply. Omitted = 'new_booking' (uses
   * booking_notice_period_days, default 0). Pass 'reschedule' from a
   * reschedule picker to keep the stricter notice_period_days. */
  intent?: 'new_booking' | 'reschedule';
}

export interface DayAvailability {
  slots: SlotAvailability[];
  window: OperatingWindow | null;
  /** Minimum-notice lead time for the requested intent (new booking:
   * booking_notice_period_days; reschedule: notice_period_days when
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

  if (query.intent) {
    params.set('intent', query.intent);
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

export interface BookingCatalog {
  services: Service[];
  packages: Package[];
  promos: Promo[];
  /** Pet Types admin CRUD + fixed-price override (20260912191/20260912192):
   * the pet type's resolved fixed price for this branch, or null if none
   * applies - only present when `CatalogQuery.petType` was given. When set,
   * it replaces every service/package's own price in the booking preview,
   * matching what booking.service.ts actually charges at confirmation. */
  fixedPrice: number | null;
}

export interface CatalogQuery {
  branchId: string;
  category?: string;
  petType?: string;
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

  if (query.petType) {
    params.set('pet_type', query.petType);
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
  branchId: string,
  petId: string
): Promise<BookingApiResult<CagePickerOptionsResult>> {
  const params = new URLSearchParams({ branch_id: branchId, pet_id: petId });

  const response = await fetch(
    `${API_BASE_URL}/bookings/cage-picker?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CagePickerOptionsResult>(response);
}

export interface CageAssignmentStatusResult {
  matched: boolean;
  cage: { id: string; cage_label: string } | null;
}

/** Custom change (cage pet-type support / customer readonly cage view). */
export async function getCageAssignmentStatus(
  accessToken: string,
  branchId: string,
  petId: string
): Promise<BookingApiResult<CageAssignmentStatusResult>> {
  const params = new URLSearchParams({ branch_id: branchId, pet_id: petId });

  const response = await fetch(
    `${API_BASE_URL}/bookings/cage-assignment-status?${params.toString()}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CageAssignmentStatusResult>(response);
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

/** Staff-only "extend stay" action (extend-hotel-stay custom change) - adds
 * whole nights to a Hotel booking's current stay; the server recomputes
 * price and reconciles it onto the booking's remaining-balance transaction
 * (or creates a new one if the booking is already Fully Paid). */
export async function extendHotelStay(
  bookingId: string,
  accessToken: string,
  payload: ExtendHotelStayPayload
): Promise<BookingApiResult<ExtendHotelStayResult>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/extend-stay`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<ExtendHotelStayResult>(response);
}

/** Manual-cancellation-credit-review custom change: the Credit Review Queue -
 * a Manual-mode branch's cancellation_logs rows still awaiting a staff
 * decision. */
export async function listPendingCreditReviews(
  accessToken: string
): Promise<BookingApiResult<CreditReviewQueueItem[]>> {
  const response = await fetch(
    `${API_BASE_URL}/cancellation-logs/pending-credit-review`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ items: CreditReviewQueueItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function decideCreditReview(
  cancellationLogId: string,
  accessToken: string,
  decision: 'approved' | 'denied'
): Promise<BookingApiResult<CancellationLog>> {
  const response = await fetch(
    `${API_BASE_URL}/cancellation-logs/${cancellationLogId}/credit-review`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ decision }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ log: CancellationLog }>(response);
  return { data: result.data?.log ?? null, error: result.error };
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

/** Customer-chosen partial payment toward a partly-paid booking's balance -
 * creates a fresh Pending 'balance' charge (amount re-checked <= remaining
 * server-side) that the customer then settles from the transaction list. */
export async function addBalancePaymentForBooking(
  bookingId: string,
  amount: number,
  accessToken: string
): Promise<BookingApiResult<{ transaction: { id: string } }>> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${bookingId}/balance-payment`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ amount }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<{ transaction: { id: string } }>(response);
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

/** Slot-conflict notification: the logged-in customer's own still-Pending
 * bookings that just lost their date/time/staff/cage slot to another
 * customer's payment - powers the CustomerPortalPage dashboard popup and the
 * notification bell's link-through for booking_slot_conflict rows. */
export async function listMyConflictedBookings(
  accessToken: string
): Promise<BookingApiResult<ConflictedBooking[]>> {
  const response = await fetch(`${API_BASE_URL}/bookings/conflicts/mine`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ conflicts: ConflictedBooking[] }>(response);
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
 * (In Progress -> Completed). No-show has no endpoint - it's a lazy
 * transition the server applies whenever a booking is read. Payment is
 * tracked independently via `payment_status`, settled per-transaction on the
 * Transactions page (billing feature) - not on this status track.
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
