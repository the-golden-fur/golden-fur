import { randomBytes } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  createStaffAuthUser,
  deleteAuthUser,
} from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  assertArchivedBeforeHardDelete,
  assertInactiveBeforeArchive,
} from '../../../shared/archive/archiveGuard.ts';
import { encryptTempCredential } from '../../../shared/crypto/tempCredential.ts';
import { sendAccountCreatedEmail } from '../../../shared/email/accountCreatedEmail.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import type { StaffProfile, StaffRole } from '../staff.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Generates a temporary password for a newly created staff account. Still
 * returned directly in the create-account response (as a fallback the admin
 * can relay by hand), but as of Issue #74 it's also emailed via Resend
 * (accountCreatedEmail.ts) and stored encrypted at rest (see
 * tempCredential.ts) so a later resend can re-deliver this exact password
 * instead of generating a new one.
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

/**
 * requesterRole/requesterBranchId are accepted for interface compatibility
 * with the controller (which reads them off requireBranch) but no longer
 * consulted here - Issue #73 gives Admin full branch-assignment parity with
 * Superadmin, not just same-branch parity, so branchId is no longer
 * restricted by who's asking. RLS already allowed Admin to write branch_id
 * at all (staff_profiles INSERT policy since 20260701015); the same-branch
 * check removed here was the one remaining restriction narrower than RLS.
 * Route-level requireRole(ADMIN_ROLES) still gates who can call this at all.
 */
export async function createStaffAccount({
  username,
  registeredEmail,
  displayName,
  role,
  branchId,
}: CreateStaffAccountParams): Promise<CreateStaffAccountResult> {
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

  // Encrypted so Issue #74's resend action can re-deliver this exact
  // password later (Supabase Auth itself never retains the plaintext after
  // createStaffAuthUser above). Best-effort: a failure here shouldn't fail
  // account creation itself - temporaryPassword is still returned below as
  // the fallback the admin can relay by hand, same as before this issue.
  try {
    const encrypted = encryptTempCredential(temporaryPassword);
    await supabase
      .from('staff_profiles')
      .update({
        temp_credential_ciphertext: encrypted.ciphertext,
        temp_credential_iv: encrypted.iv,
      })
      .eq('id', profile.id);
  } catch (error) {
    console.error('Failed to store encrypted temp credential:', error);
  }

  // Best-effort: email delivery failing must not fail account creation -
  // temporaryPassword is still returned below either way.
  try {
    await sendAccountCreatedEmail({
      to: registeredEmail,
      username,
      temporaryPassword,
    });
  } catch (error) {
    console.error('Failed to send account_created email:', error);
  }

  // Issue #97: the in-app mirror of the email above - reuses the existing
  // accountCreatedEmail.ts template unchanged (it's already sent above),
  // this only adds the notifications row so the new staff member sees the
  // event in their inbox once they log in. Best-effort, same as the email.
  try {
    await createNotification({
      recipientStaffId: profile.id,
      eventType: 'account_created',
      title: 'Account created',
      message: `Your Golden Fur staff account has been created. Username: ${username}.`,
    });
  } catch (error) {
    console.error('Failed to write account_created notification:', error);
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

interface StaffActionScopeParams {
  requesterRole: string;
  requesterBranchId: string;
  targetStaffId: string;
}

async function getScopedTargetOrThrow({
  requesterRole,
  requesterBranchId,
  targetStaffId,
}: StaffActionScopeParams): Promise<StaffProfile> {
  const { data: target, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('id', targetStaffId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!target) throwWithStatus(404, 'Staff profile not found');

  if (
    requesterRole !== 'Superadmin' &&
    target.branch_id !== requesterBranchId
  ) {
    throwWithStatus(403, 'Admins can only manage staff at their own branch');
  }

  return target;
}

/**
 * Deactivate-first CRUD safety (archive workflow): staff never had a delete
 * path at all before this - manageStaffAccount's isActive toggle is the
 * deactivate step, this is the new archive step layered on top of it.
 */
export async function archiveStaffAccount(
  params: StaffActionScopeParams
): Promise<void> {
  const target = await getScopedTargetOrThrow(params);
  assertInactiveBeforeArchive(target.is_active, 'This staff account');

  const { error } = await supabase
    .from('staff_profiles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.targetStaffId);

  if (error) throwWithStatus(400, error.message);
}

export async function restoreStaffAccount(
  params: StaffActionScopeParams
): Promise<void> {
  await getScopedTargetOrThrow(params);

  const { error } = await supabase
    .from('staff_profiles')
    .update({ archived_at: null })
    .eq('id', params.targetStaffId);

  if (error) throwWithStatus(400, error.message);
}

export async function listArchivedStaff(
  requesterRole: string,
  requesterBranchId: string
): Promise<StaffProfile[]> {
  let query = supabase
    .from('staff_profiles')
    .select('*')
    .not('archived_at', 'is', null);

  if (requesterRole !== 'Superadmin') {
    query = query.eq('branch_id', requesterBranchId);
  }

  const { data, error } = await query.order('archived_at', {
    ascending: false,
  });

  if (error) throwWithStatus(400, error.message);

  return data ?? [];
}

/** Also removes the underlying Supabase auth user, since staff_profiles.id
 * *is* auth.users.id - a staff account has no login-capable identity
 * separate from its profile row the way a "just delete the row" model would
 * assume. */
export async function hardDeleteStaffAccount(
  params: StaffActionScopeParams
): Promise<void> {
  const target = await getScopedTargetOrThrow(params);
  assertArchivedBeforeHardDelete(target.archived_at, 'This staff account');

  const { error } = await supabase
    .from('staff_profiles')
    .delete()
    .eq('id', params.targetStaffId);

  if (error) throwWithStatus(400, error.message);

  await deleteAuthUser(params.targetStaffId);
}

/**
 * Self-service username change (Account settings). Deliberately self-only -
 * no requester/target split like manageStaffAccount above, since an
 * Admin/Superadmin changing another staff member's username isn't a
 * supported flow here (see the validator's Issue #22 comment).
 */
export async function updateStaffUsername(
  staffId: string,
  username: string
): Promise<StaffProfile> {
  const { data: existing, error: lookupError } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('username', username)
    .neq('id', staffId)
    .maybeSingle();

  if (lookupError) throwWithStatus(400, lookupError.message);
  if (existing) throwWithStatus(409, 'Username already exists');

  const { data, error } = await supabase
    .from('staff_profiles')
    .update({ username })
    .eq('id', staffId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to update username');
  }

  return data;
}
