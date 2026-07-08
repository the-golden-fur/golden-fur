import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  customerSignupValidator,
  customerLoginValidator,
  customerTotpValidator,
} from './modules/validators/customerAuth.validator.ts';
import { mergeOrCreate } from './services/accountMerge.service.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';
import {
  checkMfaLockout,
  formatMfaLockoutResponse,
  incrementMfaLockout,
  resetMfaLockout,
} from '../../../shared/services/mfaLockout/mfaLockout.service.ts';
import {
  createCustomerAuthUser,
  createCustomerProfile,
} from '../../../shared/auth/api/supabaseAuth.api.ts';

function getUserClient(req: Request) {
  const authHeader = req.headers.authorization;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader || '' } } }
  );
}

// signInWithPassword mutates the calling client's internal session state, so it
// must never be called on the shared `supabase` (service-role) singleton - doing
// so would silently downgrade every subsequent request on the process from
// service-role to that customer's RLS-restricted session. Use a throwaway client.
function createSignInClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function customerSignupController(req: Request, res: Response) {
  const parsed = customerSignupValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const { full_name, account_email, password } = parsed.data;

  try {
    // 1. Create Supabase Auth user. We use the admin API (not auth.signUp) so no
    // confirmation email is sent - the hosted project's email rate limit (2/hour)
    // otherwise causes every signup to fail with a 400 "email rate limit exceeded".
    const { data: authData, error: authError } = await createCustomerAuthUser(
      account_email,
      password,
      { full_name }
    );

    if (authError || !authData.user) {
      return res
        .status(400)
        .json({ error: authError?.message || 'Failed to sign up' });
    }

    // 2. Insert into customer_profiles
    const { error: profileError } = await createCustomerProfile({
      id: authData.user.id,
      account_email,
      full_name,
      primary_auth_provider: 'email',
    });

    if (profileError) {
      // In a robust system, we might compensate by deleting the auth user, but for now we'll just error
      return res.status(500).json({
        error:
          'Signed up but failed to create profile: ' + profileError.message,
      });
    }

    // 3. admin.createUser doesn't return a session, so sign in to establish one.
    const { data: signInData, error: signInError } =
      await createSignInClient().auth.signInWithPassword({
        email: account_email,
        password,
      });

    if (signInError || !signInData.session) {
      return res.status(201).json({
        message: 'Signup successful',
        user: authData.user,
      });
    }

    return res.status(201).json({
      message: 'Signup successful',
      user: authData.user,
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerLoginController(req: Request, res: Response) {
  const parsed = customerLoginValidator.safeParse(req.body);

  if (!parsed.success) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { account_email, password } = parsed.data;

  try {
    const { data: authData, error: authError } =
      await createSignInClient().auth.signInWithPassword({
        email: account_email,
        password,
      });

    if (authError || !authData.session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerMfaEnrollController(req: Request, res: Response) {
  try {
    const userClient = getUserClient(req);
    const { data, error } = await userClient.auth.mfa.enroll({
      factorType: 'totp',
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerMfaVerifyController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = customerTotpValidator.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { code } = parsed.data;

  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const lockoutStatus = await checkMfaLockout(userId);
    if (lockoutStatus.locked) {
      return res.status(423).json(formatMfaLockoutResponse(lockoutStatus));
    }

    const userClient = getUserClient(req);

    const { data: factorsData, error: factorsError } =
      await userClient.auth.mfa.listFactors();
    if (factorsError || !factorsData) {
      return res.status(400).json({ error: 'Failed to list factors' });
    }

    const totpFactor =
      factorsData.totp.find((f) => f.status === 'verified') ||
      factorsData.totp.find((f) => (f.status as string) === 'unverified');
    if (!totpFactor) {
      return res.status(400).json({ error: 'No TOTP factor found' });
    }

    const { data: challengeData, error: challengeError } =
      await userClient.auth.mfa.challenge({ factorId: totpFactor.id });
    if (challengeError) {
      return res.status(400).json({ error: challengeError.message });
    }

    const { error: verifyError } = await userClient.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      const updatedLockoutStatus = await incrementMfaLockout(userId);
      if (updatedLockoutStatus.locked) {
        return res
          .status(423)
          .json(formatMfaLockoutResponse(updatedLockoutStatus));
      }

      return res.status(401).json({ error: 'Invalid code' });
    }

    await resetMfaLockout(userId);

    const { data: refreshData, error: refreshError } =
      await userClient.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({
      access_token: refreshData.session.access_token,
      refresh_token: refreshData.session.refresh_token,
      expires_in: refreshData.session.expires_in,
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerOauthCallbackController(
  req: Request,
  res: Response
) {
  // In a real OAuth flow with an API, the client handles the redirect from Google/Facebook,
  // gets the token from the URL hash, and sends the session/access_token to the server to verify.
  // We'll expect the client to send the access_token in the Authorization header.

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed token' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Since mergeOrCreate expects a Session object for `session.user`, we can construct a dummy session object
    // Or we can just use the user object directly. We will mock a session object.
    const mockSession = { user: authData.user } as any;

    const result = await mergeOrCreate(mockSession);

    return res.status(200).json({
      success: true,
      action: result.action,
      profile: result.profile,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error.message || 'Internal server error' });
  }
}
