/** Every experimental feature switch the app knows about - one row each in
 * public.feature_flags (20261025281). Adding a feature means adding its key
 * here and seeding its row in a migration. */
export const FEATURE_FLAG_KEYS = ['spin_wheel'] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

/** Settings > Experimental is Superadmin-only, same as Landing Page/FAQs. */
export const FEATURE_FLAG_WRITE_ROLES = ['Superadmin'] as const;

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(key);
}
