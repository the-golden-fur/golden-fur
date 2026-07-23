import type {
  Consultation,
  ScheduleFollowUpResult,
  UpdateConsultationPayload,
} from '../veterinary.types';

interface VeterinaryApiResult<T> {
  data: T | null;
  error: string | null;
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

export async function listConsultationQueue(
  accessToken: string
): Promise<VeterinaryApiResult<Consultation[]>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/consultations/queue`,
    {
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ consultations: Consultation[] }>(response);
  return { data: result.data?.consultations ?? null, error: result.error };
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

export async function scheduleFollowUp(
  consultationId: string,
  accessToken: string,
  followUpDate: string
): Promise<VeterinaryApiResult<ScheduleFollowUpResult>> {
  const response = await fetch(
    `${API_BASE_URL}/veterinary/consultations/${consultationId}/follow-up`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ follow_up_date: followUpDate }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<ScheduleFollowUpResult>(response);
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
