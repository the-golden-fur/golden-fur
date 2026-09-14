import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Cage, CageSize, CageStatus } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Custom change (cage pet-type support): flattens the cage_pet_types embed
 * (`[{pet_type: 'Dog'}, {pet_type: 'Cat'}]`) into the plain `pet_types:
 * string[]` shape callers/clients expect. */
function withFlattenedPetTypes(
  row: Record<string, unknown> & { cage_pet_types?: { pet_type: string }[] }
): Cage {
  const { cage_pet_types, ...rest } = row;
  return {
    ...(rest as Omit<Cage, 'pet_types'>),
    pet_types: (cage_pet_types ?? []).map((row) => row.pet_type),
  };
}

const CAGE_SELECT_WITH_PET_TYPES = '*, cage_pet_types(pet_type)';

/** #78 AC-1: cage grid grouped by size category, for the Cage Status Grid
 * UI (#79) - one query, grouped client-side/here rather than four separate
 * round trips. */
export async function getCageGrid(
  branchId: string
): Promise<Record<CageSize, Cage[]>> {
  const { data, error } = await supabase
    .from('cages')
    .select(CAGE_SELECT_WITH_PET_TYPES)
    .eq('branch_id', branchId)
    .order('cage_label', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const grid: Record<CageSize, Cage[]> = { S: [], M: [], L: [], XL: [] };

  for (const row of data ?? []) {
    const cage = withFlattenedPetTypes(row);
    grid[cage.size].push(cage);
  }

  return grid;
}

/**
 * #78 AC-1/AC-5: live query consumed by M03's Slot Picker - Under
 * Maintenance and Occupied cages are simply excluded, no separate cached
 * "available count" table to keep in sync (#78 dev notes).
 */
export async function getAvailableCageCountsBySize(
  branchId: string
): Promise<Record<CageSize, number>> {
  const { data, error } = await supabase
    .from('cages')
    .select('size')
    .eq('branch_id', branchId)
    .eq('status', 'Available');

  if (error) throwWithStatus(400, error.message);

  const counts: Record<CageSize, number> = { S: 0, M: 0, L: 0, XL: 0 };

  for (const cage of (data ?? []) as Array<{ size: CageSize }>) {
    counts[cage.size] += 1;
  }

  return counts;
}

/**
 * #78 AC-2: Admin/Superadmin-only manual toggle - authorization is enforced
 * at the route layer (requireRole), this service only rejects an invalid
 * source state so a cage currently Occupied or Reserved can't be forced
 * into/out of maintenance out from under an active stay.
 */
export async function setCageMaintenanceStatus(
  cageId: string,
  branchId: string,
  status: Extract<CageStatus, 'Available' | 'Under Maintenance'>
): Promise<Cage> {
  const requiredCurrentStatus =
    status === 'Under Maintenance' ? 'Available' : 'Under Maintenance';

  const { data: updated, error } = await supabase
    .from('cages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', cageId)
    .eq('branch_id', branchId)
    .eq('status', requiredCurrentStatus)
    .select(CAGE_SELECT_WITH_PET_TYPES)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!updated) {
    throwWithStatus(
      409,
      `Cage must be ${requiredCurrentStatus} to change to ${status}`
    );
  }

  return withFlattenedPetTypes(updated);
}

interface CreateCageParams {
  branchId: string;
  cageLabel: string;
  size: CageSize;
  petTypes: string[];
}

/** Custom change (Cage CRUD, Settings > Config): Admin/Superadmin can add a
 * cage to their branch's inventory - authorization enforced at the route
 * layer (requireRole), matching setCageMaintenanceStatus's convention.
 *
 * Custom change (cage pet-type support): petTypes must be non-empty (also
 * enforced at the validator layer, belt-and-suspenders) - a cage that
 * supports no pet type at all could never be matched to any booking. The
 * cage_pet_types rows are inserted right after the cage itself; if that
 * insert fails, the just-created cage row is deleted so a cage never sits
 * with zero pet types. */
export async function createCage({
  branchId,
  cageLabel,
  size,
  petTypes,
}: CreateCageParams): Promise<Cage> {
  if (petTypes.length === 0) {
    throwWithStatus(400, 'At least one pet type is required');
  }

  const { data, error } = await supabase
    .from('cages')
    .insert({ branch_id: branchId, cage_label: cageLabel, size })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create cage');
  }

  const { error: petTypesError } = await supabase
    .from('cage_pet_types')
    .insert(petTypes.map((pet_type) => ({ cage_id: data.id, pet_type })));

  if (petTypesError) {
    await supabase.from('cages').delete().eq('id', data.id);
    throwWithStatus(400, petTypesError.message);
  }

  return { ...(data as Omit<Cage, 'pet_types'>), pet_types: petTypes };
}

interface UpdateCageParams {
  cageId: string;
  branchId: string;
  cageLabel?: string;
  size?: CageSize;
  petTypes?: string[];
}

/** Custom change (Cage CRUD): edits a cage's label/size - status changes
 * stay on setCageMaintenanceStatus's own conditional-update path above,
 * kept separate rather than folded in here.
 *
 * Custom change (cage pet-type support): when petTypes is given (must be
 * non-empty), replaces the cage's cage_pet_types membership wholesale
 * (delete + reinsert) rather than diffing - this table is tiny per cage, so
 * a diff isn't worth the extra complexity. */
export async function updateCage({
  cageId,
  branchId,
  cageLabel,
  size,
  petTypes,
}: UpdateCageParams): Promise<Cage> {
  if (petTypes !== undefined && petTypes.length === 0) {
    throwWithStatus(400, 'At least one pet type is required');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (cageLabel !== undefined) updates.cage_label = cageLabel;
  if (size !== undefined) updates.size = size;

  const { data, error } = await supabase
    .from('cages')
    .update(updates)
    .eq('id', cageId)
    .eq('branch_id', branchId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Cage not found');

  if (petTypes === undefined) {
    const { data: existing, error: existingError } = await supabase
      .from('cage_pet_types')
      .select('pet_type')
      .eq('cage_id', cageId);

    if (existingError) throwWithStatus(400, existingError.message);

    return {
      ...(data as Omit<Cage, 'pet_types'>),
      pet_types: (existing ?? []).map((row) => row.pet_type),
    };
  }

  const { error: deleteError } = await supabase
    .from('cage_pet_types')
    .delete()
    .eq('cage_id', cageId);

  if (deleteError) throwWithStatus(400, deleteError.message);

  const { error: insertError } = await supabase
    .from('cage_pet_types')
    .insert(petTypes.map((pet_type) => ({ cage_id: cageId, pet_type })));

  if (insertError) throwWithStatus(400, insertError.message);

  return { ...(data as Omit<Cage, 'pet_types'>), pet_types: petTypes };
}

interface DeleteCageParams {
  cageId: string;
  branchId: string;
}

/** Custom change (Cage CRUD): blocks deleting a cage that's currently
 * Occupied/Reserved - a stay's cage_id would otherwise be orphaned
 * mid-stay. Available/Under Maintenance cages may be deleted freely. */
export async function deleteCage({
  cageId,
  branchId,
}: DeleteCageParams): Promise<void> {
  const { data: cage, error: fetchError } = await supabase
    .from('cages')
    .select('status')
    .eq('id', cageId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (fetchError) throwWithStatus(400, fetchError.message);
  if (!cage) throwWithStatus(404, 'Cage not found');
  if (cage.status === 'Occupied' || cage.status === 'Reserved') {
    throwWithStatus(
      409,
      `Cannot delete a cage that is currently ${cage.status}`
    );
  }

  const { error: deleteError } = await supabase
    .from('cages')
    .delete()
    .eq('id', cageId)
    .eq('branch_id', branchId);

  if (deleteError) throwWithStatus(400, deleteError.message);
}
