import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Cage, CageSize, CageStatus } from '../hotel.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** #78 AC-1: cage grid grouped by size category, for the Cage Status Grid
 * UI (#79) - one query, grouped client-side/here rather than four separate
 * round trips. */
export async function getCageGrid(
  branchId: string
): Promise<Record<CageSize, Cage[]>> {
  const { data, error } = await supabase
    .from('cages')
    .select('*')
    .eq('branch_id', branchId)
    .order('cage_label', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  const grid: Record<CageSize, Cage[]> = { S: [], M: [], L: [], XL: [] };

  for (const cage of (data ?? []) as Cage[]) {
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
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!updated) {
    throwWithStatus(
      409,
      `Cage must be ${requiredCurrentStatus} to change to ${status}`
    );
  }

  return updated as Cage;
}

interface CreateCageParams {
  branchId: string;
  cageLabel: string;
  size: CageSize;
}

/** Custom change (Cage CRUD, Settings > Config): Admin/Superadmin can add a
 * cage to their branch's inventory - authorization enforced at the route
 * layer (requireRole), matching setCageMaintenanceStatus's convention. */
export async function createCage({
  branchId,
  cageLabel,
  size,
}: CreateCageParams): Promise<Cage> {
  const { data, error } = await supabase
    .from('cages')
    .insert({ branch_id: branchId, cage_label: cageLabel, size })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create cage');
  }

  return data as Cage;
}

interface UpdateCageParams {
  cageId: string;
  branchId: string;
  cageLabel?: string;
  size?: CageSize;
}

/** Custom change (Cage CRUD): edits a cage's label/size - status changes
 * stay on setCageMaintenanceStatus's own conditional-update path above,
 * kept separate rather than folded in here. */
export async function updateCage({
  cageId,
  branchId,
  cageLabel,
  size,
}: UpdateCageParams): Promise<Cage> {
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

  return data as Cage;
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
