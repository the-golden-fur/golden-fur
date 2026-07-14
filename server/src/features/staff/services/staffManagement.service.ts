import { randomBytes } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  createStaffAuthUser,
  deleteAuthUser,
} from '../../../shared/auth/api/supabaseAuth.api.ts';
import type { StaffProfile, StaffRole } from '../staff.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Generates a temporary password for a newly created staff account. There is
 * no notification/email infrastructure yet (M11 is Sprint 6), so this is
 * returned directly in the create-account response for the admin to relay to
 * the new hire, rather than emailed - see the create-staff-account issue doc.
 */
function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

interface CreateStaffAccountParams {
  requesterRole: string;
  requesterBranchId: string;
  username: string;
  registeredEmail: string;
  displayName: string;
  role: StaffRole;
  branchId: string;
}

export interface CreateStaffAccountResult {
  staff: StaffProfile;
  temporaryPassword: string;
}

export async function createStaffAccount({
  requesterRole,
  requesterBranchId,
  username,
  registeredEmail,
  displayName,
  role,
  branchId,
}: CreateStaffAccountParams): Promise<CreateStaffAccountResult> {
  if (requesterRole !== 'Superadmin' && branchId !== requesterBranchId) {
    throwWithStatus(403, 'Admins can only create staff at their own branch');
  }

  const { data: existingUsername, error: usernameError } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (usernameError) throwWithStatus(400, usernameError.message);
  if (existingUsername) throwWithStatus(409, 'Username already exists');

  const { data: existingEmail, error: emailError } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('registered_email', registeredEmail)
    .maybeSingle();

  if (emailError) throwWithStatus(400, emailError.message);
  if (existingEmail) throwWithStatus(409, 'Registered email already exists');

  const temporaryPassword = generateTemporaryPassword();

  const { data: authData, error: authError } = await createStaffAuthUser(
    registeredEmail,
    temporaryPassword
  );

  if (authError || !authData.user) {
    throwWithStatus(400, authError?.message ?? 'Failed to create staff login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .insert({
      id: authData.user.id,
      branch_id: branchId,
      role,
      username,
      registered_email: registeredEmail,
      display_name: displayName,
    })
    .select('*')
    .maybeSingle();

  if (profileError || !profile) {
    // Compensate for the orphaned Auth user - a failed profile insert must
    // not leave a login-capable account with no staff_profiles row.
    await deleteAuthUser(authData.user.id);
    throwWithStatus(
      400,
      profileError?.message ?? 'Failed to create staff profile'
    );
  }

  return { staff: profile, temporaryPassword };
}

interface ManageStaffAccountParams {
  requesterRole: string;
  requesterBranchId: string;
  targetStaffId: string;
  role?: StaffRole;
  branchId?: string;
  isActive?: boolean;
}

export async function manageStaffAccount({
  requesterRole,
  requesterBranchId,
  targetStaffId,
  role,
  branchId,
  isActive,
}: ManageStaffAccountParams): Promise<StaffProfile> {
  const { data: target, error: lookupError } = await supabase
    .from('staff_profiles')
    .select('id, branch_id')
    .eq('id', targetStaffId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (!target) throwWithStatus(404, 'Staff profile not found');

  if (
    requesterRole !== 'Superadmin' &&
    target.branch_id !== requesterBranchId
  ) {
    throwWithStatus(403, 'Admins can only manage staff at their own branch');
  }

  // Promote/demote and branch transfer are Superadmin-only (M01 Process 5);
  // deactivate is available to Admin or Superadmin (already enforced by the
  // route's requireRole, so isActive needs no further check here).
  if (
    (role !== undefined || branchId !== undefined) &&
    requesterRole !== 'Superadmin'
  ) {
    throwWithStatus(403, 'Only a Superadmin can change staff role or branch');
  }

  const update: Record<string, unknown> = {};
  if (role !== undefined) update.role = role;
  if (branchId !== undefined) update.branch_id = branchId;
  if (isActive !== undefined) update.is_active = isActive;

  const { data, error } = await supabase
    .from('staff_profiles')
    .update(update)
    .eq('id', targetStaffId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update staff account');
  }

  return data;
}
