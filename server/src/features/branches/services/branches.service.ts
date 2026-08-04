import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Branch } from '../branches.types.ts';
import type {
  CreateBranchInput,
  UpdateBranchInput,
} from '../modules/validators/branches.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export async function listBranchesFull(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
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
