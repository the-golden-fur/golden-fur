import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../../shared/auth/api/supabaseAuth.api.ts';
import type { MedicalNoteCategory, PetMedicalNote } from '../pet.types.ts';

export const MEDICAL_NOTE_MANAGER_ROLES: readonly string[] = [
  'Receptionist',
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
];

interface CreateMedicalNoteParams {
  requesterId: string;
  petId: string;
  noteText: string;
  category: MedicalNoteCategory;
}

interface ListMedicalNotesParams {
  requesterId: string;
  petId: string;
}

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

async function assertIsAuthorizedStaff(requesterId: string) {
  const role = await getStaffRoleOrNull(requesterId);

  if (!role || !MEDICAL_NOTE_MANAGER_ROLES.includes(role)) {
    throwWithStatus(403, 'Forbidden');
  }
}

async function assertCanRead(requesterId: string, petId: string) {
  const ownerId = await getPetOwnerId(petId);

  if (!ownerId) {
    throwWithStatus(404, 'Pet not found');
  }

  if (ownerId === requesterId) {
    return;
  }

  await assertIsAuthorizedStaff(requesterId);
}

/**
 * Create + list only, per Issue #33's "append, never overwrite" annotation
 * trail design (mirrors the M07 consultation-history precedent) - no
 * update/delete function exists here, and pet.routes.ts exposes no
 * corresponding PATCH/DELETE route either (AC-6).
 */
export async function createMedicalNote({
  requesterId,
  petId,
  noteText,
  category,
}: CreateMedicalNoteParams): Promise<PetMedicalNote> {
  await assertIsAuthorizedStaff(requesterId);

  const { data: pet } = await supabase
    .from('pets')
    .select('id')
    .eq('id', petId)
    .maybeSingle();

  if (!pet) {
    throwWithStatus(404, 'Pet not found');
  }

  const { data, error } = await supabase
    .from('pet_medical_notes')
    .insert({
      pet_id: petId,
      note_text: noteText,
      category,
      staff_id: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create medical note');
  }

  return data;
}

export async function listMedicalNotes({
  requesterId,
  petId,
}: ListMedicalNotesParams): Promise<PetMedicalNote[]> {
  await assertCanRead(requesterId, petId);

  const { data, error } = await supabase
    .from('pet_medical_notes')
    .select('*')
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}
