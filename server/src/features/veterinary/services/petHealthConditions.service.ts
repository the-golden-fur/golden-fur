import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import type { PetHealthCondition } from '../../customers/pets/pet.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

async function getPetOwnerId(petId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pets')
    .select('customer_id')
    .eq('id', petId)
    .maybeSingle();

  return data?.customer_id ?? null;
}

interface UpsertHealthConditionsParams {
  requesterId: string;
  petId: string;
  conditionsText: string | null;
}

/**
 * Issue #78: any Veterinarian may record/update any Makati pet's current
 * health conditions - no per-pet assigned-vet restriction, matching the
 * existing M07 consultations.veterinarian_id pattern (Sprint 3). One row per
 * pet (pet_id UNIQUE - see #72 migration), so this is an upsert, not an
 * append-only insert.
 */
export async function upsertPetHealthConditions({
  requesterId,
  petId,
  conditionsText,
}: UpsertHealthConditionsParams): Promise<PetHealthCondition> {
  const role = await getStaffRoleOrNull(requesterId);

  if (role !== 'Veterinarian') {
    throwWithStatus(403, 'Forbidden');
  }

  const { data: pet } = await supabase
    .from('pets')
    .select('id')
    .eq('id', petId)
    .maybeSingle();

  if (!pet) {
    throwWithStatus(404, 'Pet not found');
  }

  const { data, error } = await supabase
    .from('pet_health_conditions')
    .upsert(
      {
        pet_id: petId,
        conditions_text: conditionsText,
        updated_by_staff_id: requesterId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pet_id' }
    )
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to update health conditions'
    );
  }

  return data;
}

interface GetHealthConditionsParams {
  requesterId: string;
  petId: string;
}

/**
 * Read access: any authenticated staff role, plus the owning customer
 * (read-only, own pet only) - mirrors medicalNote.service.ts's assertCanRead
 * shape. Returns null (not a 404) when no row exists yet - "no health
 * conditions recorded" is a valid, common state (#78 AC-4), not an error.
 */
export async function getPetHealthConditions({
  requesterId,
  petId,
}: GetHealthConditionsParams): Promise<PetHealthCondition | null> {
  const ownerId = await getPetOwnerId(petId);

  if (!ownerId) {
    throwWithStatus(404, 'Pet not found');
  }

  if (ownerId !== requesterId) {
    const role = await getStaffRoleOrNull(requesterId);

    if (!role) {
      throwWithStatus(403, 'Forbidden');
    }
  }

  const { data, error } = await supabase
    .from('pet_health_conditions')
    .select('*')
    .eq('pet_id', petId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  return data ?? null;
}
