import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import type { Branch } from '../branches.types.ts';
import type {
  CreateBranchInput,
  UpdateBranchInput,
} from '../modules/validators/branches.validator.ts';

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = '23503';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Archived branches never show up in normal browsing, same as
 * listPromos/listPetTypes et al. - reachable only via listArchivedBranches. */
export async function listBranchesFull(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .is('archived_at', null)
    .order('name');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Branch[];
}

export async function getBranch(branchId: string): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Branch not found');

  return data as Branch;
}

export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .insert(input)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throwWithStatus(409, 'A branch with that name already exists');
    }
    throwWithStatus(400, error.message);
  }
  if (!data) throwWithStatus(500, 'Failed to create branch');

  return data as Branch;
}

export async function updateBranch(
  branchId: string,
  updates: UpdateBranchInput
): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', branchId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throwWithStatus(409, 'A branch with that name already exists');
    }
    throwWithStatus(400, error.message);
  }
  if (!data) throwWithStatus(404, 'Branch not found');

  return data as Branch;
}

/**
 * Deactivate-first CRUD safety (archive workflow), mirroring
 * promos.service.ts's archivePromo: archiving is soft - the row moves to
 * the archive list via archived_at, it is not deleted.
 */
export async function archiveBranch(branchId: string): Promise<void> {
  const branch = await getBranch(branchId);
  assertInactiveBeforeArchive(branch.is_active, 'This branch');

  const { error } = await supabase
    .from('branches')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', branchId);

  if (error) throwWithStatus(400, error.message);
}

export async function restoreBranch(branchId: string): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({ archived_at: null })
    .eq('id', branchId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Branch[];
}

export async function hardDeleteBranch(branchId: string): Promise<void> {
  const branch = await getBranch(branchId);
  assertArchivedBeforeHardDelete(branch.archived_at, 'This branch');

  const { error } = await supabase.from('branches').delete().eq('id', branchId);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throwWithStatus(
        409,
        'This branch is still referenced elsewhere (staff, bookings, or other records) and cannot be permanently deleted'
      );
    }
    throwWithStatus(400, error.message);
  }
}
