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
