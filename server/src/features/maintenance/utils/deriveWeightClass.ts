import type {
  PetWeightClassConfiguration,
  WeightClass,
} from '../maintenance.types.ts';

/** Just the three cut-offs deriveWeightClass needs - lets callers pass a
 * partial config (e.g. an in-progress admin form) without the id/audit
 * fields. */
export type WeightClassCutoffs = Pick<
  PetWeightClassConfiguration,
  'm_min_kg' | 'l_min_kg' | 'xl_min_kg'
>;

/**
 * Pure derivation (Architectural-Change-History): a pet's recorded
 * weight in kilograms -> its S/M/L/XL weight_class, using the
 * Admin-configured cut-offs. Lower bound inclusive:
 *
 *   S:  kg <  m_min_kg
 *   M:  m_min_kg  <= kg < l_min_kg
 *   L:  l_min_kg  <= kg < xl_min_kg
 *   XL: kg >= xl_min_kg
 *
 * The client has its own copy of this exact formula
 * (client/src/features/maintenance/utils/deriveWeightClass.ts) - no shared
 * module between the two builds, so keep the two in sync if this changes.
 * The DB CHECK on pet_weight_class_configuration guarantees
 * m_min_kg < l_min_kg < xl_min_kg, so the branches below are exhaustive.
 */
export function deriveWeightClass(
  weightKg: number,
  cutoffs: WeightClassCutoffs
): WeightClass {
  if (weightKg < cutoffs.m_min_kg) {
    return 'S';
  }
  if (weightKg < cutoffs.l_min_kg) {
    return 'M';
  }
  if (weightKg < cutoffs.xl_min_kg) {
    return 'L';
  }
  return 'XL';
}
