import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Breed, PetType } from '../maintenance.types.ts';
import type {
  CreateBreedInput,
  UpdateBreedInput,
} from '../modules/validators/maintenance.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Postgres unique_violation / foreign_key_violation. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface ListBreedsParams {
  petType?: PetType;
}

/**
 * Epic A follow-up (breeds previously had no CRUD - only the seeded list
 * from migration 20260725041). This is the admin-management surface; the
 * pet-form's own breed dropdown (BreedSelect) still reads directly via
 * Supabase (customer.api.ts listBreeds) since breeds SELECT is open RLS to
 * every authenticated user, staff and customers alike - unaffected by this.
 */
export async function listBreeds({
  petType,
}: ListBreedsParams): Promise<Breed[]> {
  let query = supabase.from('breeds').select('*');

  if (petType) {
    query = query.eq('pet_type', petType);
  }

  const { data, error } = await query.order('pet_type').order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function createBreed(input: CreateBreedInput): Promise<Breed> {
  const { data, error } = await supabase
    .from('breeds')
    .insert({ pet_type: input.pet_type, name: input.name })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `A ${input.pet_type} breed named "${input.name}" already exists`
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create breed');

  return data;
}

export async function updateBreed(
  breedId: string,
  updates: UpdateBreedInput
): Promise<Breed> {
  const { data, error } = await supabase
    .from('breeds')
    .update(updates)
    .eq('id', breedId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        'A breed with this name already exists for this pet type'
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(404, 'Breed not found');

  return data;
}

export async function deleteBreed(breedId: string): Promise<void> {
  const { error } = await supabase.from('breeds').delete().eq('id', breedId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This breed is still assigned to one or more pets and cannot be deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
