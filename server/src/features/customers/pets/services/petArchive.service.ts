import { supabase } from '../../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../../shared/archive/archiveGuard.ts';
import type { Pet } from '../pet.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

async function getPetOrThrow(petId: string): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', petId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Pet not found');

  return data;
}

/**
 * Independent of customerArchive.service.ts's cascade - a pet can be
 * deactivated/archived on its own (e.g. a deceased or rehomed pet) without
 * touching the rest of the customer's account.
 */
export async function deactivatePet(petId: string): Promise<void> {
  await getPetOrThrow(petId);

  const { error } = await supabase
    .from('pets')
    .update({ is_active: false })
    .eq('id', petId);

  if (error) throwWithStatus(400, error.message);
}

export async function archivePet(petId: string): Promise<void> {
  const pet = await getPetOrThrow(petId);
  assertInactiveBeforeArchive(pet.is_active, 'This pet');

  const { error } = await supabase
    .from('pets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', petId);

  if (error) throwWithStatus(400, error.message);
}

export async function restorePet(petId: string): Promise<void> {
  await getPetOrThrow(petId);

  const { error } = await supabase
    .from('pets')
    .update({ archived_at: null })
    .eq('id', petId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedPets(customerId?: string): Promise<Pet[]> {
  let query = supabase.from('pets').select('*').not('archived_at', 'is', null);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query.order('archived_at', {
    ascending: false,
  });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function hardDeletePet(petId: string): Promise<void> {
  const pet = await getPetOrThrow(petId);
  assertArchivedBeforeHardDelete(pet.archived_at, 'This pet');

  const { error } = await supabase.from('pets').delete().eq('id', petId);

  if (error) throwWithStatus(400, error.message);
}
