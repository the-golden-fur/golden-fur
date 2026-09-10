import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PetWeightClassConfiguration } from '../maintenance.types.ts';
import type { UpdatePetWeightClassConfigurationInput } from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface UpdatePetWeightClassConfigurationParams {
  requesterId: string;
  updates: UpdatePetWeightClassConfigurationInput;
}

/**
 * Singleton row, seeded by migration 20260910186 - there is always exactly
 * one. Read by pet.controller.ts when deriving weight_class from weight_kg,
 * and by the assessment/pet forms + WeightClassConfigurationPage on the
 * client at request time.
 */
export async function getPetWeightClassConfiguration(): Promise<PetWeightClassConfiguration> {
  const { data, error } = await supabase
    .from('pet_weight_class_configuration')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data)
    throwWithStatus(500, 'Pet weight class configuration is not seeded');

  return data as PetWeightClassConfiguration;
}

export async function updatePetWeightClassConfiguration({
  requesterId,
  updates,
}: UpdatePetWeightClassConfigurationParams): Promise<PetWeightClassConfiguration> {
  const existing = await getPetWeightClassConfiguration();

  // Enforce m < l < xl against the merge of this (partial) PATCH and the
  // stored row - the validator only sees the fields in the request.
  const merged = {
    m_min_kg: updates.m_min_kg ?? existing.m_min_kg,
    l_min_kg: updates.l_min_kg ?? existing.l_min_kg,
    xl_min_kg: updates.xl_min_kg ?? existing.xl_min_kg,
  };
  if (
    !(merged.m_min_kg < merged.l_min_kg && merged.l_min_kg < merged.xl_min_kg)
  ) {
    throwWithStatus(400, 'Weight class cut-offs must increase: M < L < XL');
  }

  const { data, error } = await supabase
    .from('pet_weight_class_configuration')
    .update({
      ...updates,
      updated_by_staff_id: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pet weight class configuration not found');

  return data as PetWeightClassConfiguration;
}
