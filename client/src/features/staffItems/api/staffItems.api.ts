import type {
  CreateStaffFoodItemPayload,
  CreateStaffMedicationItemPayload,
  PickableStaffFoodItem,
  PickableStaffMedicationItem,
  StaffFoodItem,
  StaffMedicationItem,
  UpdateStaffFoodItemPayload,
  UpdateStaffMedicationItemPayload,
} from '../staffItems.types';

interface StaffItemsApiResult<T> {
  data: T | null;
  error: string | null;
}

// staffItems.routes.ts (server) is mounted at the server root, same as
// catalog.routes.ts / hotel.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<StaffItemsApiResult<T>> {
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

export async function listMyFoodItems(
  accessToken: string
): Promise<StaffItemsApiResult<StaffFoodItem[]>> {
  const response = await fetch(`${API_BASE_URL}/staff/food-items/mine`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ items: StaffFoodItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function listPickableFoodItems(
  accessToken: string
): Promise<StaffItemsApiResult<PickableStaffFoodItem[]>> {
  const response = await fetch(`${API_BASE_URL}/staff/food-items/pickable`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ items: PickableStaffFoodItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function createFoodItem(
  payload: CreateStaffFoodItemPayload,
  accessToken: string
): Promise<StaffItemsApiResult<StaffFoodItem>> {
  const response = await fetch(`${API_BASE_URL}/staff/food-items`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ item: StaffFoodItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function updateFoodItem(
  itemId: string,
  payload: UpdateStaffFoodItemPayload,
  accessToken: string
): Promise<StaffItemsApiResult<StaffFoodItem>> {
  const response = await fetch(`${API_BASE_URL}/staff/food-items/${itemId}`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ item: StaffFoodItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function archiveFoodItem(
  itemId: string,
  accessToken: string
): Promise<StaffItemsApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/staff/food-items/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };
  return { data: null, error: null };
}

export async function listMyMedicationItems(
  accessToken: string
): Promise<StaffItemsApiResult<StaffMedicationItem[]>> {
  const response = await fetch(`${API_BASE_URL}/staff/medication-items/mine`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ items: StaffMedicationItem[] }>(response);
  return { data: result.data?.items ?? null, error: result.error };
}

export async function listPickableMedicationItems(
  accessToken: string
): Promise<StaffItemsApiResult<PickableStaffMedicationItem[]>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/medication-items/pickable`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ items: PickableStaffMedicationItem[] }>(
    response
  );
  return { data: result.data?.items ?? null, error: result.error };
}

export async function createMedicationItem(
  payload: CreateStaffMedicationItemPayload,
  accessToken: string
): Promise<StaffItemsApiResult<StaffMedicationItem>> {
  const response = await fetch(`${API_BASE_URL}/staff/medication-items`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ item: StaffMedicationItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function updateMedicationItem(
  itemId: string,
  payload: UpdateStaffMedicationItemPayload,
  accessToken: string
): Promise<StaffItemsApiResult<StaffMedicationItem>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/medication-items/${itemId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ item: StaffMedicationItem }>(response);
  return { data: result.data?.item ?? null, error: result.error };
}

export async function archiveMedicationItem(
  itemId: string,
  accessToken: string
): Promise<StaffItemsApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/medication-items/${itemId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };
  return { data: null, error: null };
}
