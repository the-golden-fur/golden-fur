import type {
  CreateSpinWheelRewardPayload,
  CustomerCoupon,
  SpinHistoryEntry,
  SpinResult,
  SpinWheelConfig,
  SpinWheelReward,
  UpdateSpinWheelRewardPayload,
  UpsertSpinWheelConfigPayload,
} from '../rewards.types';

interface RewardsApiResult<T> {
  data: T | null;
  error: string | null;
}

// rewards.routes.ts is mounted at the server root, same as credits.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<RewardsApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getSpinWheelConfig(
  accessToken: string
): Promise<RewardsApiResult<SpinWheelConfig>> {
  const response = await fetch(`${API_BASE_URL}/rewards/spin-wheel/config`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ config: SpinWheelConfig }>(response);
  return { data: result.data?.config ?? null, error: result.error };
}

export async function updateSpinWheelConfig(
  accessToken: string,
  payload: UpsertSpinWheelConfigPayload
): Promise<RewardsApiResult<SpinWheelConfig>> {
  const response = await fetch(`${API_BASE_URL}/rewards/spin-wheel/config`, {
    method: 'PUT',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ config: SpinWheelConfig }>(response);
  return { data: result.data?.config ?? null, error: result.error };
}

export async function listSpinWheelRewards(
  accessToken: string,
  includeInactive = false
): Promise<RewardsApiResult<SpinWheelReward[]>> {
  const query = includeInactive ? '?include_inactive=true' : '';
  const response = await fetch(
    `${API_BASE_URL}/rewards/spin-wheel/rewards${query}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ rewards: SpinWheelReward[] }>(response);
  return { data: result.data?.rewards ?? null, error: result.error };
}

export async function listArchivedSpinWheelRewards(
  accessToken: string
): Promise<RewardsApiResult<SpinWheelReward[]>> {
  const response = await fetch(
    `${API_BASE_URL}/rewards/spin-wheel/rewards/archived`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ rewards: SpinWheelReward[] }>(response);
  return { data: result.data?.rewards ?? null, error: result.error };
}

export async function createSpinWheelReward(
  accessToken: string,
  payload: CreateSpinWheelRewardPayload
): Promise<RewardsApiResult<SpinWheelReward>> {
  const response = await fetch(`${API_BASE_URL}/rewards/spin-wheel/rewards`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ reward: SpinWheelReward }>(response);
  return { data: result.data?.reward ?? null, error: result.error };
}

export async function updateSpinWheelReward(
  rewardId: string,
  accessToken: string,
  payload: UpdateSpinWheelRewardPayload
): Promise<RewardsApiResult<SpinWheelReward>> {
  const response = await fetch(
    `${API_BASE_URL}/rewards/spin-wheel/rewards/${rewardId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ reward: SpinWheelReward }>(response);
  return { data: result.data?.reward ?? null, error: result.error };
}

export async function archiveSpinWheelReward(
  rewardId: string,
  accessToken: string
): Promise<RewardsApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/rewards/spin-wheel/rewards/${rewardId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };
  return { data: null, error: null };
}

export async function restoreSpinWheelReward(
  rewardId: string,
  accessToken: string
): Promise<RewardsApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/rewards/spin-wheel/rewards/${rewardId}/restore`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };
  return { data: null, error: null };
}

export async function hardDeleteSpinWheelReward(
  rewardId: string,
  accessToken: string
): Promise<RewardsApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/rewards/spin-wheel/rewards/${rewardId}/permanent`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };
  return { data: null, error: null };
}

/** A customer caller omits customerId (resolves to themself); a
 * receptionist triggering a walk-in's earned spin passes it explicitly -
 * same convention as credits.api.ts's own listCreditBalances. */
export async function getMySpinCredits(
  accessToken: string,
  customerId?: string
): Promise<RewardsApiResult<number>> {
  const query = customerId ? `?customer_id=${customerId}` : '';
  const response = await fetch(
    `${API_BASE_URL}/rewards/my-spin-credits${query}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ available_spins: number }>(response);
  return { data: result.data?.available_spins ?? null, error: result.error };
}

export async function spinTheWheel(
  accessToken: string,
  customerId?: string
): Promise<RewardsApiResult<SpinResult>> {
  const response = await fetch(`${API_BASE_URL}/rewards/spin`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(customerId ? { customer_id: customerId } : {}),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ result: SpinResult }>(response);
  return { data: result.data?.result ?? null, error: result.error };
}

export async function getMyCoupons(
  accessToken: string,
  customerId?: string
): Promise<RewardsApiResult<CustomerCoupon[]>> {
  const query = customerId ? `?customer_id=${customerId}` : '';
  const response = await fetch(`${API_BASE_URL}/rewards/my-coupons${query}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ coupons: CustomerCoupon[] }>(response);
  return { data: result.data?.coupons ?? null, error: result.error };
}

export async function getMySpinHistory(
  accessToken: string,
  customerId?: string
): Promise<RewardsApiResult<SpinHistoryEntry[]>> {
  const query = customerId ? `?customer_id=${customerId}` : '';
  const response = await fetch(
    `${API_BASE_URL}/rewards/my-spin-history${query}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) return { data: null, error: await parseError(response) };

  const result = await parseBody<{ history: SpinHistoryEntry[] }>(response);
  return { data: result.data?.history ?? null, error: result.error };
}
