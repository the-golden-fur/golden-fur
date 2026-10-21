import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../../shared/auth/api/supabaseAuth.api.ts';
import { createNotification } from '../../../notifications/services/notification.service.ts';
import type {
  PendingVaccinationRecord,
  PetVaccinationRecord,
} from '../pet.types.ts';
import {
  removeVaccinationProofs,
  uploadVaccinationProof,
  withSignedProofUrls,
  type VaccinationProofFile,
} from './vaccinationProof.service.ts';

/**
 * Broader than CUSTOMER_MANAGER_ROLES (customer.types.ts): Veterinarian is
 * added per Modules-Features M02 Process 5, which shows "Receptionist or
 * Veterinarian" as the actor for vaccination annotation types.
 */
export const VACCINATION_MANAGER_ROLES: readonly string[] = [
  'Receptionist',
  'Front Desk',
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
];

const REJECTION_REASON_MAX_LENGTH = 300;

interface CreateVaccinationRecordParams {
  requesterId: string;
  petId: string;
  vaccineName: string;
  dateAdministered: string;
  nextDueDate?: string;
  notes?: string;
  /** The vaccination card - required when the pet's owner adds the record,
   * optional for staff. */
  proofFile?: VaccinationProofFile;
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
  /** A replacement card photo - e.g. after one was rejected as unreadable. */
  proofFile?: VaccinationProofFile;
}

interface DeleteVaccinationRecordParams {
  requesterId: string;
  petId: string;
  recordId: string;
}

interface ReviewVaccinationRecordParams {
  requesterId: string;
  petId: string;
  recordId: string;
  decision: 'verify' | 'reject';
  reason?: string;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Today in Manila - the clinic's calendar day - as YYYY-MM-DD. */
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date()
  );
}

/** An owner can only report a vaccination that already happened, and a
 * next due date can't come before it was given. YYYY-MM-DD strings compare
 * in date order. */
function assertSensibleDates(
  dateAdministered: string | undefined,
  nextDueDate: string | null | undefined,
  { forOwner }: { forOwner: boolean }
) {
  if (forOwner && dateAdministered && dateAdministered > manilaToday()) {
    throwWithStatus(400, 'The vaccination date cannot be in the future');
  }
  if (dateAdministered && nextDueDate && nextDueDate < dateAdministered) {
    throwWithStatus(
      400,
      'The next due date cannot be before the vaccination date'
    );
  }
}

async function getPetOwnerId(petId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pets')
    .select('customer_id')
    .eq('id', petId)
    .maybeSingle();

  return data?.customer_id ?? null;
}

async function isVaccinationManager(requesterId: string): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && VACCINATION_MANAGER_ROLES.includes(role);
}

async function assertIsAuthorizedStaff(requesterId: string) {
  if (!(await isVaccinationManager(requesterId))) {
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

/**
 * Who may write this pet's records: 'staff' (VACCINATION_MANAGER_ROLES -
 * any record) or 'owner' (the pet's customer - only their own unverified
 * ones). Anyone else is refused before learning whether the pet exists.
 */
async function resolveWriter(
  requesterId: string,
  petId: string
): Promise<'staff' | 'owner'> {
  const isStaff = await isVaccinationManager(requesterId);
  const { data: pet } = await supabase
    .from('pets')
    .select('id, customer_id')
    .eq('id', petId)
    .maybeSingle();

  if (!isStaff && (!pet || pet.customer_id !== requesterId)) {
    throwWithStatus(403, 'Forbidden');
  }
  if (!pet) throwWithStatus(404, 'Pet not found');

  return isStaff ? 'staff' : 'owner';
}

async function getRecordOrThrow(
  recordId: string,
  petId: string
): Promise<PetVaccinationRecord> {
  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .select('*')
    .eq('id', recordId)
    .eq('pet_id', petId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Vaccination record not found');

  return data as PetVaccinationRecord;
}

/** An owner may change or delete only a record they added that staff
 * haven't verified - a verified record is the clinic's record. */
function assertOwnerMayChange(
  record: PetVaccinationRecord,
  requesterId: string
) {
  if (
    record.reported_by_customer_id !== requesterId ||
    record.status === 'verified'
  ) {
    throwWithStatus(
      403,
      'Only records you added that the clinic has not verified yet can be changed'
    );
  }
}

/**
 * Staff (as before): saved 'verified' straight away, reviewed by the staff
 * member who entered it. The pet's owner (customer-reported vaccinations):
 * saved 'pending' with their card photo, which is required, until staff
 * review it. Information only - nothing in booking reads the status.
 */
export async function createVaccinationRecord({
  requesterId,
  petId,
  vaccineName,
  dateAdministered,
  nextDueDate,
  notes,
  proofFile,
}: CreateVaccinationRecordParams): Promise<PetVaccinationRecord> {
  const writer = await resolveWriter(requesterId, petId);
  const isOwner = writer === 'owner';

  assertSensibleDates(dateAdministered, nextDueDate, { forOwner: isOwner });

  if (isOwner && !proofFile) {
    throwWithStatus(400, 'A photo of the vaccination card is required');
  }

  const proofPath = proofFile
    ? await uploadVaccinationProof(petId, proofFile)
    : null;

  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .insert({
      pet_id: petId,
      vaccine_name: vaccineName,
      date_administered: dateAdministered,
      next_due_date: nextDueDate ?? null,
      notes: notes ?? null,
      proof_path: proofPath,
      ...(isOwner
        ? {
            status: 'pending',
            reported_by_customer_id: requesterId,
            administered_by: null,
          }
        : {
            status: 'verified',
            administered_by: requesterId,
            reviewed_by_staff_id: requesterId,
            reviewed_at: new Date().toISOString(),
          }),
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    if (proofPath) await removeVaccinationProofs([proofPath]);
    throwWithStatus(
      400,
      error?.message ?? 'Failed to create vaccination record'
    );
  }

  const [signed] = await withSignedProofUrls([data as PetVaccinationRecord]);
  return signed;
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

  return withSignedProofUrls((data ?? []) as PetVaccinationRecord[]);
}

/**
 * Staff can change any record. The pet's owner can change only their own
 * pending or rejected one - and changing a rejected record sends it back
 * for review, since what was turned down is no longer what's there.
 */
export async function updateVaccinationRecord({
  requesterId,
  petId,
  recordId,
  updates,
  proofFile,
}: UpdateVaccinationRecordParams): Promise<PetVaccinationRecord> {
  const writer = await resolveWriter(requesterId, petId);
  const record = await getRecordOrThrow(recordId, petId);
  const isOwner = writer === 'owner';

  if (isOwner) assertOwnerMayChange(record, requesterId);

  assertSensibleDates(
    updates.date_administered ?? record.date_administered,
    updates.next_due_date === undefined
      ? record.next_due_date
      : updates.next_due_date,
    { forOwner: isOwner }
  );

  const proofPath = proofFile
    ? await uploadVaccinationProof(petId, proofFile)
    : null;

  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .update({
      ...updates,
      ...(proofPath ? { proof_path: proofPath } : {}),
      ...(isOwner && record.status === 'rejected'
        ? {
            status: 'pending',
            rejection_reason: null,
            reviewed_by_staff_id: null,
            reviewed_at: null,
          }
        : {}),
    })
    .eq('id', recordId)
    .eq('pet_id', petId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    if (proofPath) await removeVaccinationProofs([proofPath]);
    if (error) throwWithStatus(400, error.message);
    throwWithStatus(404, 'Vaccination record not found');
  }

  // The replaced card is no longer referenced anywhere.
  if (proofPath && record.proof_path) {
    await removeVaccinationProofs([record.proof_path]);
  }

  const [signed] = await withSignedProofUrls([data as PetVaccinationRecord]);
  return signed;
}

/** Staff: any record. The pet's owner: their own unverified one. The card
 * photo goes with it. */
export async function deleteVaccinationRecord({
  requesterId,
  petId,
  recordId,
}: DeleteVaccinationRecordParams): Promise<void> {
  const writer = await resolveWriter(requesterId, petId);
  const record = await getRecordOrThrow(recordId, petId);

  if (writer === 'owner') assertOwnerMayChange(record, requesterId);

  const { error } = await supabase
    .from('pet_vaccination_records')
    .delete()
    .eq('id', recordId)
    .eq('pet_id', petId);

  if (error) throwWithStatus(400, error.message);

  if (record.proof_path) await removeVaccinationProofs([record.proof_path]);
}

/**
 * Staff verify or reject a pending, owner-added record (a reason is
 * required to reject), then tell the owner. Only a pending record can be
 * reviewed - the update is conditioned on that, so two staff reviewing at
 * once can't both win. The notification is best-effort.
 */
export async function reviewVaccinationRecord({
  requesterId,
  petId,
  recordId,
  decision,
  reason,
}: ReviewVaccinationRecordParams): Promise<PetVaccinationRecord> {
  await assertIsAuthorizedStaff(requesterId);

  const rejectionReason = reason?.trim() ?? '';

  if (decision === 'reject') {
    if (!rejectionReason) {
      throwWithStatus(400, 'A reason is required to reject a record');
    }
    if (rejectionReason.length > REJECTION_REASON_MAX_LENGTH) {
      throwWithStatus(
        400,
        `The reason must be ${REJECTION_REASON_MAX_LENGTH} characters or fewer`
      );
    }
  }

  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .update({
      status: decision === 'verify' ? 'verified' : 'rejected',
      rejection_reason: decision === 'reject' ? rejectionReason : null,
      reviewed_by_staff_id: requesterId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', recordId)
    .eq('pet_id', petId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) {
    throwWithStatus(409, 'This record is no longer waiting for review');
  }

  const record = data as PetVaccinationRecord;
  await sendVaccinationReviewedNotification(record);

  const [signed] = await withSignedProofUrls([record]);
  return signed;
}

async function sendVaccinationReviewedNotification(
  record: PetVaccinationRecord
): Promise<void> {
  try {
    const { data: pet } = await supabase
      .from('pets')
      .select('name, customer_id')
      .eq('id', record.pet_id)
      .maybeSingle();

    const recipientCustomerId =
      record.reported_by_customer_id ?? pet?.customer_id;
    if (!recipientCustomerId) return;

    const petName = pet?.name ?? 'your pet';

    await createNotification({
      recipientCustomerId,
      eventType: 'vaccination_reviewed',
      ...(record.status === 'verified'
        ? {
            title: `${petName}'s ${record.vaccine_name} vaccination was verified`,
            message: `The clinic checked the vaccination card you added for ${petName} and verified the record.`,
          }
        : {
            title: `${petName}'s ${record.vaccine_name} vaccination needs another look`,
            message: `The clinic couldn't verify the record you added for ${petName}: ${record.rejection_reason}. You can fix it from ${petName}'s profile and it will be checked again.`,
          }),
    });
  } catch (error) {
    console.error('Failed to send vaccination_reviewed notification:', error);
  }
}

/**
 * The staff review queue: every pending, owner-added record, oldest first,
 * with pet and owner names (batched lookups, no FK embeds - the convention
 * bookingActivity.service.ts follows) and signed card links. Clinic-wide:
 * pets and customers belong to no branch, and a customer may add records
 * before their first booking anywhere.
 */
export async function listPendingVaccinationRecords(
  requesterId: string
): Promise<PendingVaccinationRecord[]> {
  await assertIsAuthorizedStaff(requesterId);

  const { data, error } = await supabase
    .from('pet_vaccination_records')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const records = (data ?? []) as PetVaccinationRecord[];
  if (records.length === 0) return [];

  const petIds = [...new Set(records.map((record) => record.pet_id))];
  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, name, customer_id')
    .in('id', petIds);

  if (petsError) throwWithStatus(400, petsError.message);

  const petById = new Map((pets ?? []).map((pet) => [pet.id as string, pet]));
  const customerIds = [
    ...new Set(
      (pets ?? []).map((pet) => pet.customer_id as string).filter(Boolean)
    ),
  ];

  const { data: owners, error: ownersError } = customerIds.length
    ? await supabase
        .from('customer_profiles')
        .select('id, full_name')
        .in('id', customerIds)
    : { data: [], error: null };

  if (ownersError) throwWithStatus(400, ownersError.message);

  const ownerNameById = new Map(
    (owners ?? []).map((owner) => [
      owner.id as string,
      owner.full_name as string,
    ])
  );

  const signed = await withSignedProofUrls(records);

  return signed.map((record) => {
    const pet = petById.get(record.pet_id);
    return {
      ...record,
      pet_name: (pet?.name as string | undefined) ?? null,
      owner_name: pet ? (ownerNameById.get(pet.customer_id) ?? null) : null,
    };
  });
}
