/**
 * Experimental feature switches (Settings > Experimental). The read is
 * public - every shell, signed in or not, needs it - and the write is
 * Superadmin-only server-side (featureFlags.routes.ts).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** Every switch the app knows about - mirrors the server's
 * FEATURE_FLAG_KEYS (featureFlags.types.ts). */
export type FeatureFlagKey = 'spin_wheel';

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

/** Everything off - what the app assumes before (or without) a response, so
 * an experimental feature never flashes on by accident. */
export const ALL_FEATURES_OFF: FeatureFlags = { spin_wheel: false };

export interface FeatureFlagsApiResult {
  data: FeatureFlags | null;
  error: string | null;
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

async function readFlags(response: Response): Promise<FeatureFlagsApiResult> {
  const body = (await response.json().catch(() => null)) as {
    flags?: Partial<FeatureFlags>;
    error?: string;
  } | null;

  if (!response.ok) {
    return { data: null, error: body?.error ?? GENERIC_ERROR };
  }

  return { data: { ...ALL_FEATURES_OFF, ...body?.flags }, error: null };
}

export async function getFeatureFlags(): Promise<FeatureFlagsApiResult> {
  try {
    return await readFlags(await fetch(`${API_BASE_URL}/public/feature-flags`));
  } catch {
    return { data: null, error: GENERIC_ERROR };
  }
}

export async function setFeatureFlag(
  accessToken: string,
  key: FeatureFlagKey,
  enabled: boolean
): Promise<FeatureFlagsApiResult> {
  try {
    return await readFlags(
      await fetch(`${API_BASE_URL}/maintenance/feature-flags/${key}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      })
    );
  } catch {
    return { data: null, error: GENERIC_ERROR };
  }
}
