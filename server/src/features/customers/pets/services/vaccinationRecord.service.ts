import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../../shared/auth/api/supabaseAuth.api.ts';
import type { PetVaccinationRecord } from '../pet.types.ts';

/**
 * Broader than CUSTOMER_MANAGER_ROLES (customer.types.ts): Veterinarian is
 * added per Modules-Features M02 Process 5, which shows "Receptionist or
 * Veterinarian" as the actor for vaccination annotation types.
 */
export const VACCINATION_MANAGER_ROLES: readonly string[] = [
  'Receptionist',
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
];

interface CreateVaccinationRecordParams {
  requesterId: string;
  petId: string;
  vaccineName: string;
  dateAdministered: string;
  nextDueDate?: string;
  notes?: string;
}

interface ListVaccinationRecordsParams {
  requesterId: string;
  petId: string;
}

interface UpdateVaccinationRecordParams {
  requesterId: string;
  petId: string;
  recordId: string;
  updates: Partial<{
    vaccine_name: string;
    date_administered: string;
    next_due_date: string | null;
    notes: string | null;
  }>;
}

interface DeleteVaccinationRecordParams {
  requesterId: string;
  petId: string;
  recordId: string;
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

  if (!role || !VACCINATION_MANAGER_ROLES.includes(role)) {
    throwWithStatus(403, 'Forbidden');
  }
}

/** Owning customer (read-only) or authorized staff. */
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

export async function createVaccinationRecord({
  requesterId,
  petId,
  vaccineName,
  dateAdministered,
  nextDueDate,
  notes,
}: CreateVaccinationRecordParams): Promise<PetVaccinationRecord> {
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
    .from('pet_vaccination_records')
    .insert({
      pet_id: petId,
      vaccine_name: vaccineName,
      date_administered: dateAdministered,
      next_due_date: nextDueDate ?? null,
      administered_by: requesterId,
      notes: notes ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(
      400,
      error?.message ?? 'Failed to create vaccination record'
    );
  }

  return data;
}

export async function listVaccinationRecords({
  requesterId,
  petId,
}: ListVaccinationRecordsParams): Promise<PetVaccinationRecord[]> {
  await assertCanRead(requesterId, petId);

  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .select('*')
    .eq('pet_id', petId)
    .order('date_administered', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

export async function updateVaccinationRecord({
  requesterId,
  petId,
  recordId,
  updates,
}: UpdateVaccinationRecordParams): Promise<PetVaccinationRecord> {
  await assertIsAuthorizedStaff(requesterId);

  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .update(updates)
    .eq('id', recordId)
    .eq('pet_id', petId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Vaccination record not found');

  return data;
}

export async function deleteVaccinationRecord({
  requesterId,
  petId,
  recordId,
}: DeleteVaccinationRecordParams): Promise<void> {
  await assertIsAuthorizedStaff(requesterId);

  const { error } = await supabase
    .from('pet_vaccination_records')
    .delete()
    .eq('id', recordId)
    .eq('pet_id', petId);

  if (error) throwWithStatus(400, error.message);
}
