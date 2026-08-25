import type {
  Consultation,
  CreateMedicationCatalogItemPayload,
  CreateProcedureCatalogItemPayload,
  LinkFollowUpBookingResult,
  PetHealthCondition,
  UpdateConsultationPayload,
  UpdateMedicationCatalogItemPayload,
  UpdateProcedureCatalogItemPayload,
  VeterinarianPatient,
  VetMedicationCatalogItem,
  VetProcedureCatalogItem,
} from '../veterinary.types';

interface VeterinaryApiResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Booking-status revision: the queue endpoint now only ever returns
 * consultations whose booking is still actionable (bookings.status IN
 * Pending/In Progress - see consultation.service.ts's merged
 * listConsultationQueue) - the old separate "pendingBookings" (awaiting
 * payment confirmation, no consultation yet) list is gone along with the
 * server's now-merged two-function split.
 */
export interface ConsultationQueueResult {
  consultations: Consultation[];
}

// veterinary.routes.ts (server) is mounted at the server root (not under
// /auth), same as grooming.routes.ts/daycare.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<VeterinaryApiResult<T>> {
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

export interface ConsultationQueueDateRange {
  /** YYYY-MM-DD, inclusive. Omitted (both) defaults to today, server-side. */
  dateFrom?: string;
  dateTo?: string;
}

export async function listConsultationQueue(
  accessToken: string,
  dateRange: ConsultationQueueDateRange = {}
): Promise<VeterinaryApiResult<ConsultationQueueResult>> {
  const params = new URLSearchParams();
  if (dateRange.dateFrom) params.set('date_from', dateRange.dateFrom);
  if (dateRange.dateTo) params.set('date_to', dateRange.dateTo);

  const queryString = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/veterinary/consultations/queue${queryString ? `?${queryString}` : ''}`,
    {
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ consultations: Consultation[] }>(response);

  if (!result.data) {
    return { data: null, error: result.error };
  }

  return {
    data: { consultations: result.data.consultations },
    error: null,
  };
}

export async function updateConsultation(
  consultationId: string,
  accessToken: string,
  payload: UpdateConsultationPayload
): Promise<VeterinaryApiResult<Consultation>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/consultations/${consultationId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ consultation: Consultation }>(response);
  return { data: result.data?.consultation ?? null, error: result.error };
}

/** Links a booking already created via the normal booking flow (see
 * ScheduleFollowUpModal) onto this consultation as its follow-up. */
export async function linkFollowUpBooking(
  consultationId: string,
  accessToken: string,
  bookingId: string
): Promise<VeterinaryApiResult<LinkFollowUpBookingResult>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/consultations/${consultationId}/follow-up`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ booking_id: bookingId }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<LinkFollowUpBookingResult>(response);
}

/** Issue #78: upserts the pet's current known health conditions - Veterinary-
 * role write, enforced server-side (RLS + petHealthConditions.service.ts). */
export async function upsertPetHealthConditions(
  petId: string,
  accessToken: string,
  conditionsText: string | null
): Promise<VeterinaryApiResult<PetHealthCondition>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/pets/${petId}/health-conditions`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ conditions_text: conditionsText }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ health_conditions: PetHealthCondition }>(
    response
  );
  return { data: result.data?.health_conditions ?? null, error: result.error };
}

export async function listMyPatients(
  accessToken: string
): Promise<VeterinaryApiResult<VeterinarianPatient[]>> {
  const response = await fetch(`${API_BASE_URL}/veterinary/my-patients`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ patients: VeterinarianPatient[] }>(response);
  return { data: result.data?.patients ?? null, error: result.error };
}

export async function listMedicationCatalog(
  accessToken: string
): Promise<VeterinaryApiResult<VetMedicationCatalogItem[]>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/medication-catalog`,
    {
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ medications: VetMedicationCatalogItem[] }>(
    response
  );
  return { data: result.data?.medications ?? null, error: result.error };
}

export async function createMedicationCatalogItem(
  accessToken: string,
  payload: CreateMedicationCatalogItemPayload
): Promise<VeterinaryApiResult<VetMedicationCatalogItem>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/medication-catalog`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ medication: VetMedicationCatalogItem }>(
    response
  );
  return { data: result.data?.medication ?? null, error: result.error };
}

export async function updateMedicationCatalogItem(
  itemId: string,
  accessToken: string,
  payload: UpdateMedicationCatalogItemPayload
): Promise<VeterinaryApiResult<VetMedicationCatalogItem>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/medication-catalog/${itemId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ medication: VetMedicationCatalogItem }>(
    response
  );
  return { data: result.data?.medication ?? null, error: result.error };
}

export async function deleteMedicationCatalogItem(
  itemId: string,
  accessToken: string
): Promise<VeterinaryApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/medication-catalog/${itemId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listProcedureCatalog(
  accessToken: string
): Promise<VeterinaryApiResult<VetProcedureCatalogItem[]>> {
  const response = await fetch(`${API_BASE_URL}/veterinary/procedure-catalog`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ procedures: VetProcedureCatalogItem[] }>(
    response
  );
  return { data: result.data?.procedures ?? null, error: result.error };
}

export async function createProcedureCatalogItem(
  accessToken: string,
  payload: CreateProcedureCatalogItemPayload
): Promise<VeterinaryApiResult<VetProcedureCatalogItem>> {
  const response = await fetch(`${API_BASE_URL}/veterinary/procedure-catalog`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ procedure: VetProcedureCatalogItem }>(
    response
  );
  return { data: result.data?.procedure ?? null, error: result.error };
}

export async function updateProcedureCatalogItem(
  itemId: string,
  accessToken: string,
  payload: UpdateProcedureCatalogItemPayload
): Promise<VeterinaryApiResult<VetProcedureCatalogItem>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/procedure-catalog/${itemId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ procedure: VetProcedureCatalogItem }>(
    response
  );
  return { data: result.data?.procedure ?? null, error: result.error };
}

export async function deleteProcedureCatalogItem(
  itemId: string,
  accessToken: string
): Promise<VeterinaryApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/procedure-catalog/${itemId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function getPetConsultationHistory(
  petId: string,
  accessToken: string
): Promise<VeterinaryApiResult<Consultation[]>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/pets/${petId}/history`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ consultations: Consultation[] }>(response);
  return { data: result.data?.consultations ?? null, error: result.error };
}
