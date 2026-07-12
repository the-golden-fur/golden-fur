import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';

// signInWithPassword mutates the calling client's internal session state, so it
// must never be called on the shared `supabase` (service-role) singleton - doing
// so would silently downgrade every subsequent request on the process from
// service-role to that staff member's RLS-restricted session. Use a throwaway
// client, mirroring customerAuth.controller.ts's createSignInClient().
function createSignInClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface CreateCustomerProfileFields {
  id: string;
  account_email: string;
  full_name: string;
  primary_auth_provider: 'email' | 'google' | 'facebook';
  facebook_id?: string | null;
}

/**
 * Resolves a staff login identifier to an email address.
 * Passes email-shaped identifiers straight through; otherwise looks up
 * `registered_email` in staff_profiles by username. Backs Issue #18's
 * username-or-email login.
 */
export async function resolveStaffLoginIdentifier(
  identifier: string
): Promise<string> {
  if (identifier.includes('@')) {
    return identifier;
  }

  const { data: profileData, error: profileError } = await supabase
    .from('staff_profiles')
    .select('registered_email')
    .eq('username', identifier)
    .single();

  if (profileError || !profileData?.registered_email) {
    throw new Error('Profile resolution failed');
  }

  return profileData.registered_email;
}

export async function signInWithPassword(email: string, password: string) {
  return createSignInClient().auth.signInWithPassword({ email, password });
}

export async function getStaffRole(userId: string) {
  return supabase
    .from('staff_profiles')
    .select('role')
    .eq('id', userId)
    .single();
}

/**
 * Like getStaffRole, but resolves to `null` instead of erroring when the
 * caller has no staff_profiles row at all (e.g. a customer). Epic C's
 * customer/pet routes are reachable by both customers (self) and staff
 * (on-behalf-of), so they cannot use requireRole - that middleware always
 * treats "no staff_profiles row" as 403, which would lock out every
 * customer from their own data.
 */
export async function getStaffRoleOrNull(
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('staff_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  return data?.role ?? null;
}

export async function getStaffBranch(userId: string) {
  return supabase
    .from('staff_profiles')
    .select('role, branch_id')
    .eq('id', userId)
    .single();
}

export async function createCustomerAuthUser(
  email: string,
  password: string,
  metadata: Record<string, unknown>
) {
  return supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
}

export async function createCustomerProfile(
  fields: CreateCustomerProfileFields
) {
  return supabase.from('customer_profiles').insert(fields);
}

export async function getCustomerProfileByEmail(email: string) {
  return supabase
    .from('customer_profiles')
    .select('*')
    .eq('account_email', email)
    .maybeSingle();
}

interface ListedFactor {
  id: string;
  factor_type: string;
  status: string;
}

/**
 * `listFactors()`'s per-type properties (e.g. `.totp`) are typed by the SDK
 * as verified-only, which doesn't match observed runtime behavior closely
 * enough to trust blindly. `.all` is documented as "All available factors
 * (verified and unverified)" across every factor type, so every helper below
 * reads from it and filters explicitly - that is the one source of truth for
 * "does this user have a TOTP factor, and in what state."
 */
function listTotpFactors(data: { all: ListedFactor[] }) {
  return data.all.filter((factor) => factor.factor_type === 'totp');
}

async function unenrollTotpFactorsByStatus(
  userClient: SupabaseClient,
  statuses: Array<'verified' | 'unverified'>
) {
  const { data } = await userClient.auth.mfa.listFactors();

  if (!data) {
    return;
  }

  await Promise.all(
    listTotpFactors(data)
      .filter((factor) =>
        statuses.includes(factor.status as 'verified' | 'unverified')
      )
      .map((factor) => userClient.auth.mfa.unenroll({ factorId: factor.id }))
  );
}

/**
 * Enrolls a new TOTP factor for the caller behind `userClient`, first removing
 * any of their prior *unverified* factors. Postman/manual retries otherwise
 * pile up orphaned unverified factors, and `listFactors()` during verify has
 * no way to tell which one the tester actually scanned - surfacing as
 * "No TOTP factor found" or a mismatched-secret failure.
 *
 * Supabase rejects a second concurrent enroll with "A factor with the
 * friendly name... already exists" if two enroll calls race each other (e.g.
 * a double-invoked mount effect, or two independently-mounted enroll panels)
 * and both pass the cleanup above before either has actually created its
 * factor. If that happens, clean up again and retry once against whichever
 * factor the race left behind.
 *
 * If the conflict *still* persists after that, it's no longer a race - it's
 * a stray factor left over from earlier testing/usage, and it's most likely
 * *verified* (an unverified one would already have been swept up above). One
 * last best-effort pass tries to remove verified factors too; this only
 * succeeds if the caller's session is already aal2 (Supabase's own rule for
 * removing a verified factor), so it silently does nothing otherwise and the
 * final enroll attempt's error is returned as-is for the caller to surface.
 */
export async function enrollTotpFactor(userClient: SupabaseClient) {
  const isConflict = (message?: string) =>
    Boolean(message?.toLowerCase().includes('already exists'));

  await unenrollTotpFactorsByStatus(userClient, ['unverified']);
  let result = await userClient.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Golden Fur',
  });

  if (isConflict(result.error?.message)) {
    await unenrollTotpFactorsByStatus(userClient, ['unverified']);
    result = await userClient.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Golden Fur',
    });
  }

  if (isConflict(result.error?.message)) {
    await unenrollTotpFactorsByStatus(userClient, ['verified', 'unverified']);
    result = await userClient.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Golden Fur',
    });
  }

  return result;
}

/** Whether the caller behind `userClient` has a verified TOTP factor. */
export async function getTotpEnrollmentStatus(userClient: SupabaseClient) {
  const { data, error } = await userClient.auth.mfa.listFactors();

  if (error || !data) {
    return { data: null, error: error ?? new Error('Failed to list factors') };
  }

  return {
    data: {
      enrolled: listTotpFactors(data).some(
        (factor) => factor.status === 'verified'
      ),
    },
    error: null,
  };
}

/**
 * Finds the TOTP factor to challenge/verify against for the caller behind
 * `userClient`: the verified factor if one exists (the normal login-time MFA
 * check), otherwise the most recently created unverified one (the
 * just-enrolled, not-yet-confirmed case). Reads from `.all` for the same
 * reason as the helpers above - `.totp` is typed (and behaves at runtime) as
 * verified-only, so it can never see a factor that was only just created,
 * which is exactly the factor a first-time Verify call needs to find.
 */
export async function findTotpFactorForVerify(userClient: SupabaseClient) {
  const { data, error } = await userClient.auth.mfa.listFactors();

  if (error || !data) {
    return { data: null, error: error ?? new Error('Failed to list factors') };
  }

  const factors = listTotpFactors(data);
  const factor =
    factors.find((f) => f.status === 'verified') ??
    factors.find((f) => f.status === 'unverified') ??
    null;

  return { data: factor, error: null };
}

/**
 * Unenrolls every TOTP factor the caller behind `userClient` currently has -
 * both to let a user deliberately turn MFA off and as a self-service escape
 * hatch when enrollment is stuck (e.g. behind a conflicting factor). Removing
 * a *verified* factor requires an aal2 session; Supabase enforces that itself
 * and returns a per-factor error here rather than throwing, so the caller can
 * report exactly which factor(s) couldn't be removed.
 */
export async function unenrollAllTotpFactors(userClient: SupabaseClient) {
  const { data, error } = await userClient.auth.mfa.listFactors();

  if (error || !data) {
    return {
      removed: [],
      failed: [],
      error: error ?? new Error('Failed to list factors'),
    };
  }

  const results = await Promise.all(
    listTotpFactors(data).map(async (factor) => {
      const { error: unenrollError } = await userClient.auth.mfa.unenroll({
        factorId: factor.id,
      });
      return { factorId: factor.id, error: unenrollError };
    })
  );

  return {
    removed: results
      .filter((result) => !result.error)
      .map((result) => result.factorId),
    failed: results
      .filter((result) => result.error)
      .map((result) => ({
        factorId: result.factorId,
        message: result.error!.message,
      })),
    error: null,
  };
}
