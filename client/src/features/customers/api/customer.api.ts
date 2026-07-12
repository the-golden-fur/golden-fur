import type {
  CustomerProfile,
  CustomerProfileUpdatePayload,
  Pet,
  PetCreatePayload,
  PetMedicalNote,
  PetUpdatePayload,
  PetVaccinationRecord,
} from '../customer.types';

interface CustomerApiResult<T> {
  data: T | null;
  error: string | null;
}

// customer.routes.ts (server) is mounted at the server root (not under
// /auth), same as staff.api.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<CustomerApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getCustomerProfile(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<CustomerProfile>> {
  const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ customer: CustomerProfile }>(response);
  return { data: result.data?.customer ?? null, error: result.error };
}

export async function updateCustomerProfile(
  customerId: string,
  accessToken: string,
  payload: CustomerProfileUpdatePayload
): Promise<CustomerApiResult<CustomerProfile>> {
  const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ customer: CustomerProfile }>(response);
  return { data: result.data?.customer ?? null, error: result.error };
}

export async function listCustomers(
  accessToken: string,
  emailFilter?: string
): Promise<CustomerApiResult<CustomerProfile[]>> {
  const query = emailFilter ? `?email=${encodeURIComponent(emailFilter)}` : '';
  const response = await fetch(`${API_BASE_URL}/customers${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ customers: CustomerProfile[] }>(response);
  return { data: result.data?.customers ?? null, error: result.error };
}

export async function listCustomerPets(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<Pet[]>> {
  const response = await fetch(`${API_BASE_URL}/customers/${customerId}/pets`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ pets: Pet[] }>(response);
  return { data: result.data?.pets ?? null, error: result.error };
}

export async function createPet(
  customerId: string,
  accessToken: string,
  payload: PetCreatePayload
): Promise<CustomerApiResult<Pet>> {
  const response = await fetch(`${API_BASE_URL}/customers/${customerId}/pets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ pet: Pet }>(response);
  return { data: result.data?.pet ?? null, error: result.error };
}

export async function getPet(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<Pet>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ pet: Pet }>(response);
  return { data: result.data?.pet ?? null, error: result.error };
}

export async function updatePet(
  petId: string,
  accessToken: string,
  payload: PetUpdatePayload
): Promise<CustomerApiResult<Pet>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ pet: Pet }>(response);
  return { data: result.data?.pet ?? null, error: result.error };
}

export async function listVaccinationRecords(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<PetVaccinationRecord[]>> {
  const response = await fetch(
    `${API_BASE_URL}/pets/${petId}/vaccination-records`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ records: PetVaccinationRecord[] }>(response);
  return { data: result.data?.records ?? null, error: result.error };
}

export async function listMedicalNotes(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<PetMedicalNote[]>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/medical-notes`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ notes: PetMedicalNote[] }>(response);
  return { data: result.data?.notes ?? null, error: result.error };
}
