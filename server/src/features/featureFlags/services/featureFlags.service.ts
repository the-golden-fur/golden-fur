import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  FEATURE_FLAG_KEYS,
  isFeatureFlagKey,
  type FeatureFlagKey,
  type FeatureFlags,
} from '../featureFlags.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Every known flag, defaulting to off - a key missing its row reads as
 * disabled, so an experimental feature is never on by accident. */
export async function listFeatureFlags(): Promise<FeatureFlags> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, enabled');

  if (error) throwWithStatus(400, error.message);

  const flags = Object.fromEntries(
    FEATURE_FLAG_KEYS.map((key) => [key, false])
  ) as FeatureFlags;

  for (const row of (data ?? []) as Array<{ key: string; enabled: boolean }>) {
    if (isFeatureFlagKey(row.key)) flags[row.key] = row.enabled;
  }

  return flags;
}

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('key', key)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return data?.enabled === true;
}

export async function setFeatureFlag({
  key,
  enabled,
  requesterId,
}: {
  key: string;
  enabled: boolean;
  requesterId: string;
}): Promise<FeatureFlags> {
  if (!isFeatureFlagKey(key)) throwWithStatus(404, 'Unknown feature');

  const { error } = await supabase.from('feature_flags').upsert({
    key,
    enabled,
    updated_by_staff_id: requesterId,
    updated_at: new Date().toISOString(),
  });

  if (error) throwWithStatus(400, error.message);

  return listFeatureFlags();
}
