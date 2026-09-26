import { randomUUID } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { PetTypeRow } from '../maintenance.types.ts';
import type {
  CreatePetTypeInput,
  UpdatePetTypeInput,
} from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres unique_violation / foreign_key_violation. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Pet Types admin CRUD (20260912191) - mirrors breeds.service.ts's shape.
 * Unlike breeds, pets.pet_type and breeds.pet_type both read directly via
 * open RLS (customer.api.ts), so listPetTypes here is the staff/admin
 * surface only.
 */
export async function listPetTypes(): Promise<PetTypeRow[]> {
  const { data, error } = await supabase
    .from('pet_types')
    .select('*')
    .order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

/**
 * `key` is no longer client-supplied (admin backlog: it was redundant
 * busywork alongside the auto-generated `id`, and showed up unhelpfully in
 * the admin list) - it's generated here instead. It still does real internal
 * work as the join point pets.pet_type, breeds.pet_type,
 * cage_pet_types.pet_type, and pet_type_price_overrides.pet_type all use, so
 * it can't just disappear - only its admin-facing presence does.
 */
export async function createPetType(
  input: CreatePetTypeInput
): Promise<PetTypeRow> {
  const { data, error } = await supabase
    .from('pet_types')
    .insert({ key: randomUUID(), name: input.name })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Practically unreachable with a randomUUID() key - kept as
      // defense-in-depth against a manual/out-of-band insert.
      throwWithStatus(409, 'A pet type with that key already exists');
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create pet type');

  return data;
}

export async function updatePetType(
  petTypeId: string,
  updates: UpdatePetTypeInput
): Promise<PetTypeRow> {
  const { data, error } = await supabase
    .from('pet_types')
    .update(updates)
    .eq('id', petTypeId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  if (!data) throwWithStatus(404, 'Pet type not found');

  return data;
}

export async function deletePetType(petTypeId: string): Promise<void> {
  const { error } = await supabase
    .from('pet_types')
    .delete()
    .eq('id', petTypeId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This pet type is still assigned to one or more pets or breeds and cannot be deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
