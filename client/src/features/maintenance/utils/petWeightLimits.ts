import type { WeightUnitPreference } from '../../../shared/providers/ThemeProvider/themeContext';
import {
  toDisplayValue,
  weightUnitLabel,
} from '../../../shared/utils/petWeight';
import type { PetWeightClassConfiguration } from '../maintenance.types';

/** Just the two limits - lets callers pass a partial config. */
export type PetWeightLimits = Pick<
  PetWeightClassConfiguration,
  'min_weight_kg' | 'max_weight_kg'
>;

/** The migration's defaults (20261030288): a newborn kitten/puppy up to the
 * heaviest dog on record. Used whenever the configured limits aren't
 * available, so an obviously wrong weight is always flagged as it's typed. */
export const DEFAULT_PET_WEIGHT_LIMITS: PetWeightLimits = {
  min_weight_kg: 0.1,
  max_weight_kg: 156,
};

/** The limits from a loaded config, or the defaults when it hasn't loaded
 * (or the database predates the limits). The server re-checks on save. */
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
 * The server has its own copy (server/src/features/maintenance/utils/
 * petWeightLimits.ts) - no shared module between the two builds, so keep the
 * two in sync if this changes.
 */
export function isWithinWeightLimits(
  kg: number,
  limits: PetWeightLimits
): boolean {
  return kg >= limits.min_weight_kg && kg <= limits.max_weight_kg;
}

/** A limit as staff will read it: in the unit they're typing in, with the
 * kg value alongside when that's lb. */
function describeLimit(kg: number, unit: WeightUnitPreference): string {
  return unit === 'lbs'
    ? `${toDisplayValue(kg, 'lbs')} ${weightUnitLabel('lbs')} (${kg} kg)`
    : `${kg} kg`;
}

/**
 * The inline warning for a weight that can't be recorded - not a number,
 * zero/negative, or outside the allowed range - naming the range in the unit
 * being typed. Null when the weight is fine.
 */
export function weightLimitMessage(
  kg: number,
  limits: PetWeightLimits,
  unit: WeightUnitPreference
): string | null {
  if (Number.isFinite(kg) && isWithinWeightLimits(kg, limits)) {
    return null;
  }
  return `Invalid weight - enter between ${describeLimit(
    limits.min_weight_kg,
    unit
  )} and ${describeLimit(limits.max_weight_kg, unit)}.`;
}
