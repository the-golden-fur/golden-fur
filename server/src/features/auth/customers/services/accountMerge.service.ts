import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

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

  // Facebook does not always return a verified email. If we have one, match
  // by account_email as usual; otherwise fall back to facebook_id so a
  // previously-linked account can still log back in.
  const lookupColumn = email ? 'account_email' : 'facebook_id';
  const lookupValue = email || providerId;

  if (!lookupValue) {
    throw new Error(
      'Facebook did not share an email or profile ID for this account, so it cannot be linked or created. Sign in with an account that has a verified email.'
    );
  }

  const { data: existingProfile, error: findError } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq(lookupColumn, lookupValue)
    .maybeSingle();

  if (findError && findError.code !== 'PGRST116') {
    throw new Error(`Error querying customer profiles: ${findError.message}`);
  }

  if (!existingProfile && !email) {
    throw new Error(
      'This Facebook account has no email and is not yet linked to a Golden Fur account. Sign up with email/password or Google first, then link Facebook from your profile.'
    );
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
