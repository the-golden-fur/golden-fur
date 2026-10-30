import { supabase } from '../../../config/supabase/supabase.config.ts';
import { STAFF_ITEM_ADMIN_ROLES } from '../staffItems.types.ts';
import type {
  CreateStaffMedicationItemInput,
  UpdateStaffMedicationItemInput,
} from '../modules/validators/staffItems.validator.ts';
import type {
  PickableStaffMedicationItem,
  StaffMedicationItem,
} from '../staffItems.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const UNIQUE_VIOLATION = '23505';

export async function listMineMedicationItems(
  ownerStaffId: string
): Promise<StaffMedicationItem[]> {
  const { data, error } = await supabase
    .from('staff_medication_items')
    .select('*')
    .eq('owner_staff_id', ownerStaffId)
    .is('archived_at', null)
    .order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

type OwnerJoinRow = StaffMedicationItem & {
  owner: { display_name: string } | { display_name: string }[] | null;
};

function resolveOwnerDisplayName(owner: OwnerJoinRow['owner']): string {
  if (Array.isArray(owner)) return owner[0]?.display_name ?? 'Unknown staff';
  return owner?.display_name ?? 'Unknown staff';
}

export async function listPickableMedicationItems(
  callerStaffId: string
): Promise<PickableStaffMedicationItem[]> {
  const { data, error } = await supabase
    .from('staff_medication_items')
    .select('*, owner:staff_profiles(display_name)')
    .is('archived_at', null)
    .or(`owner_staff_id.eq.${callerStaffId},is_public.eq.true`)
    .order('name');

  if (error) throwWithStatus(400, error.message);

  return ((data ?? []) as OwnerJoinRow[]).map(({ owner, ...item }) => ({
    ...item,
    owner_display_name: resolveOwnerDisplayName(owner),
    is_mine: item.owner_staff_id === callerStaffId,
  }));
}

export async function createMedicationItem(
  ownerStaffId: string,
  input: CreateStaffMedicationItemInput
): Promise<StaffMedicationItem> {
  const { data, error } = await supabase
    .from('staff_medication_items')
    .insert({ ...input, owner_staff_id: ownerStaffId })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `You already have a medication item named "${input.name}"`
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create medication item');
  return data;
}

async function assertOwnedOrAdminManageable(
  itemId: string,
  staffId: string,
  staffRole: string
): Promise<void> {
  const { data, error } = await supabase
    .from('staff_medication_items')
    .select('owner_staff_id, is_public')
    .eq('id', itemId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Medication item not found');

  const isOwner = data.owner_staff_id === staffId;
  const isAdminManagingPublic =
    data.is_public && STAFF_ITEM_ADMIN_ROLES.includes(staffRole);

  if (!isOwner && !isAdminManagingPublic) {
    throwWithStatus(403, 'You do not own this medication item');
  }
}

export async function updateMedicationItem(
  staffId: string,
  staffRole: string,
  itemId: string,
  input: UpdateStaffMedicationItemInput
): Promise<StaffMedicationItem> {
  await assertOwnedOrAdminManageable(itemId, staffId, staffRole);

  const { data, error } = await supabase
    .from('staff_medication_items')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, 'You already have a medication item with this name');
    }
    throwWithStatus(400, error.message);
  }
  if (!data) throwWithStatus(404, 'Medication item not found');
  return data;
}

export async function archiveMedicationItem(
  staffId: string,
  staffRole: string,
  itemId: string
): Promise<void> {
  await assertOwnedOrAdminManageable(itemId, staffId, staffRole);

  const { error } = await supabase
    .from('staff_medication_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throwWithStatus(400, error.message);
}
