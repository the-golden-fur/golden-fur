import type { BookingStatus } from '../../booking/booking.types';
import type {
  Cage,
  CageSize,
  CageStatus,
  CageSuggestion,
  CareLogEntry,
  CheckInPayload,
  CheckInResult,
  CheckoutResult,
  CreateCatalogItemPayload,
  CurrentPrescription,
  FoodCatalogItem,
  HotelStay,
  HotelStayWithCage,
  MedicationCatalogItem,
  UpdateCatalogItemPayload,
} from '../hotel.types';

/** A hotel_stays row only ever exists once its booking has been physically
 * checked in, so these are the only statuses meaningful to filter by here
 * (booking-status revision - hotel_stays no longer carries its own status
 * column; mirrors server/src/features/hotel/services/hotelStay.service.ts's
 * HotelStayFilterStatus). */
export type HotelStayFilterStatus = Extract<
  BookingStatus,
  'In Progress' | 'Completed' | 'Paid'
>;

interface HotelApiResult<T> {
  data: T | null;
  error: string | null;
}

// hotel.routes.ts (server) is mounted at the server root (not under /auth),
// same as daycare.routes.ts / grooming.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<HotelApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function checkInHotelStay(
  accessToken: string,
  payload: CheckInPayload
): Promise<HotelApiResult<CheckInResult>> {
  const response = await fetch(`${API_BASE_URL}/hotel/check-in`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CheckInResult>(response);
}

export async function getCageSuggestion(
  petId: string,
  accessToken: string
): Promise<HotelApiResult<CageSuggestion>> {
  const response = await fetch(
    `${API_BASE_URL}/hotel/pets/${petId}/cage-suggestion`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CageSuggestion>(response);
}

export async function getCurrentPrescriptionForPet(
  petId: string,
  accessToken: string
): Promise<HotelApiResult<CurrentPrescription | null>> {
  const response = await fetch(
    `${API_BASE_URL}/hotel/pets/${petId}/current-prescription`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ prescription: CurrentPrescription | null }>(
    response
  );
  return { data: result.data?.prescription ?? null, error: result.error };
}

export async function getCageGrid(
  accessToken: string
): Promise<HotelApiResult<Record<CageSize, Cage[]>>> {
  const response = await fetch(`${API_BASE_URL}/hotel/cages`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ grid: Record<CageSize, Cage[]> }>(response);
  return { data: result.data?.grid ?? null, error: result.error };
}

export async function setCageMaintenanceStatus(
  cageId: string,
  status: Extract<CageStatus, 'Available' | 'Under Maintenance'>,
  accessToken: string
): Promise<HotelApiResult<Cage>> {
  const response = await fetch(`${API_BASE_URL}/hotel/cage/${cageId}/status`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ cage: Cage }>(response);
  return { data: result.data?.cage ?? null, error: result.error };
}

export async function getTodayCareLogEntries(
  accessToken: string
): Promise<HotelApiResult<CareLogEntry[]>> {
  const response = await fetch(`${API_BASE_URL}/hotel/care-log/today`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ entries: CareLogEntry[] }>(response);
  return { data: result.data?.entries ?? null, error: result.error };
}

export async function getFlaggedCareLogEntries(
  accessToken: string
): Promise<HotelApiResult<CareLogEntry[]>> {
  const response = await fetch(`${API_BASE_URL}/hotel/care-log/flagged`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ entries: CareLogEntry[] }>(response);
  return { data: result.data?.entries ?? null, error: result.error };
}

export async function completeCareLogEntry(
  entryId: string,
  accessToken: string
): Promise<HotelApiResult<CareLogEntry>> {
  const response = await fetch(
    `${API_BASE_URL}/hotel/care-log-entry/${entryId}/complete`,
    { method: 'PATCH', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ entry: CareLogEntry }>(response);
  return { data: result.data?.entry ?? null, error: result.error };
}

export async function listHotelStays(
  accessToken: string,
  status?: HotelStayFilterStatus
): Promise<HotelApiResult<HotelStayWithCage[]>> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await fetch(`${API_BASE_URL}/hotel/stays${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ stays: HotelStayWithCage[] }>(response);
  return { data: result.data?.stays ?? null, error: result.error };
}

export async function checkOutHotelStay(
  stayId: string,
  accessToken: string
): Promise<HotelApiResult<CheckoutResult>> {
  const response = await fetch(
    `${API_BASE_URL}/hotel/stays/${stayId}/checkout`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CheckoutResult>(response);
}

export async function listFoodCatalog(
  accessToken: string
): Promise<HotelApiResult<FoodCatalogItem[]>> {
  const response = await fetch(`${API_BASE_URL}/hotel/food-catalog`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ items: FoodCatalogItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function createFoodCatalogItem(
  payload: CreateCatalogItemPayload,
  accessToken: string
): Promise<HotelApiResult<FoodCatalogItem>> {
  const response = await fetch(`${API_BASE_URL}/hotel/food-catalog`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ item: FoodCatalogItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function updateFoodCatalogItem(
  itemId: string,
  payload: UpdateCatalogItemPayload,
  accessToken: string
): Promise<HotelApiResult<FoodCatalogItem>> {
  const response = await fetch(`${API_BASE_URL}/hotel/food-catalog/${itemId}`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ item: FoodCatalogItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function deleteFoodCatalogItem(
  itemId: string,
  accessToken: string
): Promise<HotelApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/hotel/food-catalog/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listMedicationCatalog(
  accessToken: string
): Promise<HotelApiResult<MedicationCatalogItem[]>> {
  const response = await fetch(`${API_BASE_URL}/hotel/medication-catalog`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ items: MedicationCatalogItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function createMedicationCatalogItem(
  payload: CreateCatalogItemPayload,
  accessToken: string
): Promise<HotelApiResult<MedicationCatalogItem>> {
  const response = await fetch(`${API_BASE_URL}/hotel/medication-catalog`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ item: MedicationCatalogItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function updateMedicationCatalogItem(
  itemId: string,
  payload: UpdateCatalogItemPayload,
  accessToken: string
): Promise<HotelApiResult<MedicationCatalogItem>> {
  const response = await fetch(
    `${API_BASE_URL}/hotel/medication-catalog/${itemId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ item: MedicationCatalogItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function deleteMedicationCatalogItem(
  itemId: string,
  accessToken: string
): Promise<HotelApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/hotel/medication-catalog/${itemId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export type { HotelStay };
