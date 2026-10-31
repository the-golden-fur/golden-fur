import type { PetWeightClassConfiguration } from '../maintenance.types.ts';

/** Just the two limits - lets callers pass a partial config. */
export type PetWeightLimits = Pick<
  PetWeightClassConfiguration,
  'min_weight_kg' | 'max_weight_kg'
>;

/** The migration's defaults (20261030288). Used when the config row has no
 * limits - e.g. a database the migration hasn't reached yet - so the check
 * never compares against missing values (NaN) and rejects every weight. */
export const DEFAULT_PET_WEIGHT_LIMITS: PetWeightLimits = {
  min_weight_kg: 0.1,
  max_weight_kg: 156,
};

/** The limits from a config row as numbers (numeric columns can arrive as
 * strings), or the defaults when the row doesn't have them. */
export function weightLimitsFrom(
  config: Partial<PetWeightLimits> | null | undefined
): PetWeightLimits {
  if (config?.min_weight_kg == null || config.max_weight_kg == null) {
    return DEFAULT_PET_WEIGHT_LIMITS;
  }
  return {
    min_weight_kg: Number(config.min_weight_kg),
    max_weight_kg: Number(config.max_weight_kg),
  };
}

/**
 * Custom change (pet weight limits): whether a weight in kilograms is inside
 * the Superadmin-configured recordable range (both ends inclusive).
 *
 * The client has its own copy (client/src/features/maintenance/utils/
 * petWeightLimits.ts) - no shared module between the two builds, so keep the
 * two in sync if this changes.
 */
export function isWithinWeightLimits(
  kg: number,
  limits: PetWeightLimits
): boolean {
  const { min_weight_kg, max_weight_kg } = weightLimitsFrom(limits);
  return kg >= min_weight_kg && kg <= max_weight_kg;
}
