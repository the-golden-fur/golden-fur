import { getSupabaseClient } from '../../../shared/auth/api/auth.api';
import type {
  Breed,
  CustomerProfile,
  CustomerProfileUpdatePayload,
  Pet,
  PetCreatePayload,
  PetHealthCondition,
  PetMedicalNote,
  PetType,
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

export async function deactivateCustomer(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/customers/${customerId}/deactivate`,
    { method: 'PATCH', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function activateCustomer(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/customers/${customerId}/activate`,
    { method: 'PATCH', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function archiveCustomer(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/customers/${customerId}/archive`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function restoreCustomer(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/customers/${customerId}/restore`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listArchivedCustomers(
  accessToken: string
): Promise<CustomerApiResult<CustomerProfile[]>> {
  const response = await fetch(`${API_BASE_URL}/customers/archived`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ customers: CustomerProfile[] }>(response);
  return { data: result.data?.customers ?? null, error: result.error };
}

export async function hardDeleteCustomer(
  customerId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function deactivatePet(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/deactivate`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

/** Soft: moves the pet to the archive. Server requires is_active === false
 * first (see petArchive.service.ts's archivePet guard). */
export async function archivePet(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function restorePet(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/restore`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listArchivedPets(
  accessToken: string,
  customerId?: string
): Promise<CustomerApiResult<Pet[]>> {
  const url = customerId
    ? `${API_BASE_URL}/customers/${customerId}/pets/archived`
    : `${API_BASE_URL}/pets/archived`;
  const response = await fetch(url, { headers: authHeaders(accessToken) });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ pets: Pet[] }>(response);
  return { data: result.data?.pets ?? null, error: result.error };
}

export async function hardDeletePet(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/permanent`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
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

/**
 * No Express endpoint exposes breeds - same pattern as
 * maintenance.api.ts's listBranches (breeds RLS grants SELECT to every
 * authenticated user, so this reads directly via the Supabase client).
 */
export async function listBreeds(
  petType: PetType
): Promise<CustomerApiResult<Breed[]>> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { data: null, error: 'Supabase client is not configured.' };
  }

  const { data, error } = await supabase
    .from('breeds')
    .select('id, pet_type, name, created_at')
    .eq('pet_type', petType)
    .order('name');

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as Breed[], error: null };
}

export async function uploadPetPhoto(
  petId: string,
  accessToken: string,
  file: File
): Promise<CustomerApiResult<{ photo_url: string }>> {
  const formData = new FormData();
  formData.append('photo', file);

  const response = await fetch(`${API_BASE_URL}/pets/${petId}/photo`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: formData,
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<{ photo_url: string }>(response);
}

export async function getPetHealthConditions(
  petId: string,
  accessToken: string
): Promise<CustomerApiResult<PetHealthCondition | null>> {
  const response = await fetch(
    `${API_BASE_URL}/pets/${petId}/health-conditions`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{
    health_conditions: PetHealthCondition | null;
  }>(response);
  return { data: result.data?.health_conditions ?? null, error: result.error };
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
