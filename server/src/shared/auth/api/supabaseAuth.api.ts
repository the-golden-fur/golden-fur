import { supabase } from '../../../config/supabase/supabase.config.ts';

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
  return supabase.auth.signInWithPassword({ email, password });
}

export async function getStaffRole(userId: string) {
  return supabase.from('staff_profiles').select('role').eq('id', userId).single();
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
