import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

/**
 * Thrown when the OAuth provider (e.g. Facebook) never handed Supabase an
 * email for this identity - typically an unconfirmed provider-side email,
 * not a bug in this app. Kept distinct from other failures so the
 * controller can respond with a clear, actionable message instead of a
 * generic 500.
 */
export class MissingProviderEmailError extends Error {
  constructor() {
    super('Email is required for account merge');
    this.name = 'MissingProviderEmailError';
  }
}

/**
 * Handles merging OAuth identities or creating new customer profiles.
 * Looks up existing customer_profiles by account_email.
 * If found: updates primary_auth_provider and facebook_id.
 * If not found: creates new customer_profiles row.
 */
export async function mergeOrCreate(session: Session) {
  const user = session.user;
  const provider = user.app_metadata.provider || 'email';
  const email = user.email;
  const fullName =
    user.user_metadata.full_name || user.user_metadata.name || 'Anonymous User';
  const providerId =
    user.user_metadata.provider_id || user.user_metadata.sub || null;

  if (!email) {
    throw new MissingProviderEmailError();
  }

  // Check if a customer profile already exists for this email
  const { data: existingProfile, error: findError } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('account_email', email)
    .maybeSingle();

  if (findError && findError.code !== 'PGRST116') {
    throw new Error(`Error querying customer profiles: ${findError.message}`);
  }

  if (existingProfile) {
    // MERGE flow: Link new identity to existing profile by updating the profile
    const updates: Record<string, any> = {
      primary_auth_provider:
        provider === 'facebook' || provider === 'google'
          ? provider
          : existingProfile.primary_auth_provider,
    };

    if (provider === 'facebook' && providerId) {
      updates.facebook_id = providerId;
    }

    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update(updates)
      .eq('id', existingProfile.id);

    if (updateError) {
      throw new Error(
        `Failed to update merged account profile: ${updateError.message}`
      );
    }

    return { action: 'merged', profile: { ...existingProfile, ...updates } };
  } else {
    // CREATE flow: Create a new customer profile linked to the Supabase Auth user ID
    const newProfile: Record<string, any> = {
      id: user.id, // Primary key links to auth.users.id
      account_email: email,
      full_name: fullName,
      primary_auth_provider:
        provider === 'facebook' || provider === 'google' ? provider : 'email',
    };

    if (provider === 'facebook' && providerId) {
      newProfile.facebook_id = providerId;
    }

    const { error: insertError } = await supabase
      .from('customer_profiles')
      .insert(newProfile);

    if (insertError) {
      throw new Error(
        `Failed to create customer profile: ${insertError.message}`
      );
    }

    return { action: 'created', profile: newProfile };
  }
}
