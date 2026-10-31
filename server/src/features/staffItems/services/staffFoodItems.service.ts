import { supabase } from '../../../config/supabase/supabase.config.ts';
import { STAFF_ITEM_ADMIN_ROLES } from '../staffItems.types.ts';
import type {
  CreateStaffFoodItemInput,
  UpdateStaffFoodItemInput,
} from '../modules/validators/staffItems.validator.ts';
import type {
  PickableStaffFoodItem,
  StaffFoodItem,
} from '../staffItems.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

const UNIQUE_VIOLATION = '23505';

/** The sidebar library page's own list - every item the caller owns,
 * public or private. */
export async function listMineFoodItems(
  ownerStaffId: string
): Promise<StaffFoodItem[]> {
  const { data, error } = await supabase
    .from('staff_food_items')
    .select('*')
    .eq('owner_staff_id', ownerStaffId)
    .is('archived_at', null)
    .order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

type OwnerJoinRow = StaffFoodItem & {
  owner: { display_name: string } | { display_name: string }[] | null;
};

function resolveOwnerDisplayName(owner: OwnerJoinRow['owner']): string {
  if (Array.isArray(owner)) return owner[0]?.display_name ?? 'Unknown staff';
  return owner?.display_name ?? 'Unknown staff';
}

/** The picker's list: the caller's own items (any visibility) plus
 * everyone else's public ones, each labeled whose it is. */
export async function listPickableFoodItems(
  callerStaffId: string
): Promise<PickableStaffFoodItem[]> {
  const { data, error } = await supabase
    .from('staff_food_items')
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

export async function createFoodItem(
  ownerStaffId: string,
  input: CreateStaffFoodItemInput
): Promise<StaffFoodItem> {
  const { data, error } = await supabase
    .from('staff_food_items')
    .insert({ ...input, owner_staff_id: ownerStaffId })
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(
        409,
        `You already have a food item named "${input.name}"`
      );
    }
    throwWithStatus(400, error.message);
  }

  if (!data) throwWithStatus(400, 'Failed to create food item');
  return data;
}

/** Passes for the owner, or for an Admin/Superadmin acting on a *public*
 * item (never someone else's private one) - follow-up: Admin users and
 * above may manage any public item. */
async function assertOwnedOrAdminManageable(
  itemId: string,
  staffId: string,
  staffRole: string
): Promise<void> {
  const { data, error } = await supabase
    .from('staff_food_items')
    .select('owner_staff_id, is_public')
    .eq('id', itemId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Food item not found');

  const isOwner = data.owner_staff_id === staffId;
  const isAdminManagingPublic =
    data.is_public && STAFF_ITEM_ADMIN_ROLES.includes(staffRole);

  if (!isOwner && !isAdminManagingPublic) {
    throwWithStatus(403, 'You do not own this food item');
  }
}

export async function updateFoodItem(
  staffId: string,
  staffRole: string,
  itemId: string,
  input: UpdateStaffFoodItemInput
): Promise<StaffFoodItem> {
  await assertOwnedOrAdminManageable(itemId, staffId, staffRole);

  const { data, error } = await supabase
    .from('staff_food_items')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throwWithStatus(409, 'You already have a food item with this name');
    }
    throwWithStatus(400, error.message);
  }
  if (!data) throwWithStatus(404, 'Food item not found');
  return data;
}

/** Soft-archive only, no hard delete - a past booking/check-in may have
 * copied this item's field values into its own row. */
export async function archiveFoodItem(
  staffId: string,
  staffRole: string,
  itemId: string
): Promise<void> {
  await assertOwnedOrAdminManageable(itemId, staffId, staffRole);

  const { error } = await supabase
    .from('staff_food_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throwWithStatus(400, error.message);
}
