import type {
  CreateStaffAccountPayload,
  CreateStaffAccountResult,
  ManageStaffAccountPayload,
  PendingUnavailabilityBlock,
  ReviewUnavailabilityBlockPayload,
  StaffProfile,
  StaffProfileUpdatePayload,
  UnavailabilityBlock,
  UnavailabilityBlockPayload,
} from '../staff.types';

interface StaffApiResult<T> {
  data: T | null;
  error: string | null;
}

// staff.routes.ts is mounted at the server root (not under /auth).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<StaffApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getStaffProfile(
  staffId: string,
  accessToken: string
): Promise<StaffApiResult<StaffProfile>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ staff: StaffProfile }>(response);
  return { data: result.data?.staff ?? null, error: result.error };
}

export async function updateStaffProfile(
  staffId: string,
  accessToken: string,
  payload: StaffProfileUpdatePayload
): Promise<StaffApiResult<StaffProfile>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
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

  const result = await parseBody<{ staff: StaffProfile }>(response);
  return { data: result.data?.staff ?? null, error: result.error };
}

/** Self-service username change (Account settings tab). */
export async function updateStaffUsername(
  staffId: string,
  accessToken: string,
  username: string
): Promise<StaffApiResult<StaffProfile>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}/username`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ staff: StaffProfile }>(response);
  return { data: result.data?.staff ?? null, error: result.error };
}

export async function uploadAvatar(
  staffId: string,
  accessToken: string,
  file: File
): Promise<StaffApiResult<{ profile_photo_url: string }>> {
  const formData = new FormData();
  formData.append('avatar', file);

  const response = await fetch(`${API_BASE_URL}/staff/${staffId}/avatar`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: formData,
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<{ profile_photo_url: string }>(response);
}

export async function listUnavailabilityBlocks(
  staffId: string,
  accessToken: string
): Promise<StaffApiResult<UnavailabilityBlock[]>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/${staffId}/unavailability`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ blocks: UnavailabilityBlock[] }>(response);
  return { data: result.data?.blocks ?? null, error: result.error };
}

export async function createUnavailabilityBlock(
  staffId: string,
  accessToken: string,
  payload: UnavailabilityBlockPayload
): Promise<StaffApiResult<UnavailabilityBlock>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/${staffId}/unavailability`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(accessToken),
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ block: UnavailabilityBlock }>(response);
  return { data: result.data?.block ?? null, error: result.error };
}

export async function cancelUnavailabilityBlock(
  staffId: string,
  accessToken: string,
  blockId: string
): Promise<StaffApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/${staffId}/unavailability/${blockId}`,
    {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listPendingUnavailabilityRequests(
  accessToken: string
): Promise<StaffApiResult<PendingUnavailabilityBlock[]>> {
  const response = await fetch(`${API_BASE_URL}/staff/unavailability/pending`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ blocks: PendingUnavailabilityBlock[] }>(
    response
  );
  return { data: result.data?.blocks ?? null, error: result.error };
}

export async function reviewUnavailabilityRequest(
  staffId: string,
  blockId: string,
  accessToken: string,
  payload: ReviewUnavailabilityBlockPayload
): Promise<StaffApiResult<UnavailabilityBlock>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/${staffId}/unavailability/${blockId}/review`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(accessToken),
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ block: UnavailabilityBlock }>(response);
  return { data: result.data?.block ?? null, error: result.error };
}

export async function listStaff(
  accessToken: string
): Promise<StaffApiResult<StaffProfile[]>> {
  const response = await fetch(`${API_BASE_URL}/staff`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ staff: StaffProfile[] }>(response);
  return { data: result.data?.staff ?? null, error: result.error };
}

/**
 * Issue #74: re-sends the existing account_created credential email
 * (via Resend) as-is - does not regenerate the temporary password.
 */
export async function resendAccountEmail(
  staffId: string,
  accessToken: string
): Promise<StaffApiResult<{ message: string }>> {
  const response = await fetch(
    `${API_BASE_URL}/staff/${staffId}/resend-account-email`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<{ message: string }>(response);
}

export async function createStaffAccount(
  accessToken: string,
  payload: CreateStaffAccountPayload
): Promise<StaffApiResult<CreateStaffAccountResult>> {
  const response = await fetch(`${API_BASE_URL}/staff`, {
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

  return parseBody<CreateStaffAccountResult>(response);
}

export async function manageStaffAccount(
  staffId: string,
  accessToken: string,
  payload: ManageStaffAccountPayload
): Promise<StaffApiResult<StaffProfile>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}/manage`, {
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

  const result = await parseBody<{ staff: StaffProfile }>(response);
  return { data: result.data?.staff ?? null, error: result.error };
}

export async function archiveStaffAccount(
  staffId: string,
  accessToken: string
): Promise<StaffApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}/archive`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function restoreStaffAccount(
  staffId: string,
  accessToken: string
): Promise<StaffApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}/restore`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function listArchivedStaff(
  accessToken: string
): Promise<StaffApiResult<StaffProfile[]>> {
  const response = await fetch(`${API_BASE_URL}/staff/archived`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ staff: StaffProfile[] }>(response);
  return { data: result.data?.staff ?? null, error: result.error };
}

export async function hardDeleteStaffAccount(
  staffId: string,
  accessToken: string
): Promise<StaffApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}
