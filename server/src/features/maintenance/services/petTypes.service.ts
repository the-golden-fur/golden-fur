import { randomUUID } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  archivePatch,
  assertArchivedBeforeHardDelete,
} from '../../../shared/archive/archiveGuard.ts';
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
    .is('archived_at', null)
    .order('name');

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

/** Rejects (409) when any of the given pet_types.key values is archived -
 * used when attaching a pet type to something new (a cage, a price
 * override, a breed). Existing pets/cages that already reference an archived
 * type are unaffected. */
export async function assertPetTypesNotArchived(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const { data, error } = await supabase
    .from('pet_types')
    .select('key, name')
    .in('key', keys)
    .not('archived_at', 'is', null);

  if (error) throwWithStatus(400, error.message);

  if ((data ?? []).length > 0) {
    throwWithStatus(
      409,
      `Pet type ${(data ?? []).map((row) => `"${row.name}"`).join(', ')} is archived - restore it first`
    );
  }
}

export async function listArchivedPetTypes(): Promise<PetTypeRow[]> {
  const { data, error } = await supabase
    .from('pet_types')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

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
    .is('archived_at', null)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);

  if (!data) throwWithStatus(404, 'Pet type not found');

  return data;
}

async function loadPetTypeForArchiveAction(
  petTypeId: string
): Promise<{ archived_at: string | null }> {
  const { data, error } = await supabase
    .from('pet_types')
    .select('archived_at')
    .eq('id', petTypeId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pet type not found');

  return data;
}

/**
 * Config-menu consistency change: replaces the old hard delete on the Pet
 * Type "..." menu. Archiving hides the type from every picker but never
 * blocks on dependents - pets, breeds, cages, and price overrides that
 * already reference its key keep working (and still display its name).
 */
export async function archivePetType(petTypeId: string): Promise<PetTypeRow> {
  const existing = await loadPetTypeForArchiveAction(petTypeId);

  if (existing.archived_at) {
    throwWithStatus(409, 'Pet type is already archived');
  }

  const { data, error } = await supabase
    .from('pet_types')
    .update(archivePatch())
    .eq('id', petTypeId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pet type not found');

  return data;
}

/** Restoring is the only "turn it back on" switch now that Deactivate is
 * gone, so it re-activates the pet type too. */
export async function restorePetType(petTypeId: string): Promise<PetTypeRow> {
  const existing = await loadPetTypeForArchiveAction(petTypeId);

  if (!existing.archived_at) throwWithStatus(409, 'Pet type is not archived');

  const { data, error } = await supabase
    .from('pet_types')
    .update({ archived_at: null, is_active: true })
    .eq('id', petTypeId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pet type not found');

  return data;
}

export async function hardDeletePetType(petTypeId: string): Promise<void> {
  const existing = await loadPetTypeForArchiveAction(petTypeId);

  assertArchivedBeforeHardDelete(existing.archived_at, 'This pet type');

  const { error } = await supabase
    .from('pet_types')
    .delete()
    .eq('id', petTypeId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This pet type is still assigned to one or more pets, breeds, cages, or price overrides and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
