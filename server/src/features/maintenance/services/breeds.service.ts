import { supabase } from '../../../config/supabase/supabase.config.ts';
import { assertArchivedBeforeHardDelete } from '../../../shared/archive/archiveGuard.ts';
import { assertPetTypesNotArchived } from './petTypes.service.ts';
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
  let query = supabase.from('breeds').select('*').is('archived_at', null);

  if (petType) {
    query = query.eq('pet_type', petType);
  }

  const { data, error } = await query.order('pet_type').order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function listArchivedBreeds(): Promise<Breed[]> {
  const { data, error } = await supabase
    .from('breeds')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function createBreed(input: CreateBreedInput): Promise<Breed> {
  await assertPetTypesNotArchived([input.pet_type]);

  const { data, error } = await supabase
    .from('breeds')
    .insert({ pet_type: input.pet_type, name: input.name })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `A ${input.pet_type} breed named "${input.name}" already exists (it may be archived)`
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
    .is('archived_at', null)
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

async function loadBreedForArchiveAction(
  breedId: string
): Promise<{ archived_at: string | null }> {
  const { data, error } = await supabase
    .from('breeds')
    .select('archived_at')
    .eq('id', breedId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Breed not found');

  return data;
}

/** Config-menu consistency change: replaces the old hard delete on the Breed
 * "..." menu. Existing pets keep their breed (and its name); the breed just
 * stops appearing in pickers. Breeds have no is_active flag - archived_at is
 * their only on/off switch. */
export async function archiveBreed(breedId: string): Promise<Breed> {
  const existing = await loadBreedForArchiveAction(breedId);

  if (existing.archived_at) throwWithStatus(409, 'Breed is already archived');

  const { data, error } = await supabase
    .from('breeds')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', breedId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Breed not found');

  return data;
}

export async function restoreBreed(breedId: string): Promise<Breed> {
  const existing = await loadBreedForArchiveAction(breedId);

  if (!existing.archived_at) throwWithStatus(409, 'Breed is not archived');

  const { data, error } = await supabase
    .from('breeds')
    .update({ archived_at: null })
    .eq('id', breedId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Breed not found');

  return data;
}

export async function hardDeleteBreed(breedId: string): Promise<void> {
  const existing = await loadBreedForArchiveAction(breedId);

  assertArchivedBeforeHardDelete(existing.archived_at, 'This breed');

  const { error } = await supabase.from('breeds').delete().eq('id', breedId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This breed is still assigned to one or more pets and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
