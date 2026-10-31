import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PetAgeConfiguration } from '../maintenance.types.ts';
import type { UpdatePetAgeConfigurationInput } from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface UpdatePetAgeConfigurationParams {
  requesterId: string;
  updates: UpdatePetAgeConfigurationInput;
}

/**
 * Singleton row, seeded by migration 20261030286 - there is always exactly
 * one. Read by pet.controller.ts when checking a date of birth, and by the
 * pet form + Pets > Age Limit config section on the client.
 */
export async function getPetAgeConfiguration(): Promise<PetAgeConfiguration> {
  const { data, error } = await supabase
    .from('pet_age_configuration')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(500, 'Pet age configuration is not seeded');

  return data as PetAgeConfiguration;
}

export async function updatePetAgeConfiguration({
  requesterId,
  updates,
}: UpdatePetAgeConfigurationParams): Promise<PetAgeConfiguration> {
  const existing = await getPetAgeConfiguration();

  const { data, error } = await supabase
    .from('pet_age_configuration')
    .update({
      ...updates,
      updated_by_staff_id: requesterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pet age configuration not found');

  return data as PetAgeConfiguration;
}
