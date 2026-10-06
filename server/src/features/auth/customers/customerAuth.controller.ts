import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  customerSignupValidator,
  customerLoginValidator,
  customerTotpValidator,
  customerMfaEnrollValidator,
  customerMfaUnenrollValidator,
  customerMfaPreferenceValidator,
} from './modules/validators/customerAuth.validator.ts';
import {
  mergeOrCreate,
  MissingProviderEmailError,
} from './services/accountMerge.service.ts';
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
  getCustomerProfileByEmail,
  getAuthUserEmail,
} from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  getMfaMethodStatus,
  enrollMfaMethod,
  unenrollMfaMethod,
  challengeAndVerifyMfaMethod,
  sendMfaEmailMethodCode,
} from '../../../shared/services/mfaMethods/mfaMethods.service.ts';
import {
  getMfaPreference,
  setMfaPreference,
} from '../../../shared/services/mfaPreference/mfaPreference.service.ts';
import {
  issueTrustedDeviceToken,
  isTrustedDevice,
  revokeAllTrustedDevices,
} from '../../../shared/services/trustedDevice/trustedDevice.service.ts';

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

    // signInWithPassword only proves valid Supabase Auth credentials, which
    // customers and staff share - without this, a staff member's email/password
    // would log them into the customer portal. Reject anyone without a
    // customer_profiles row instead of handing out a session for it.
    const { data: profile, error: profileError } =
      await getCustomerProfileByEmail(account_email);

    // An anonymized account's account_email no longer matches what the
    // customer typed (see customerArchive.service.ts's anonymizeCustomer),
    // so this also naturally covers that case - don't special-case it here,
    // and don't reveal that this email was once a real account.
    if (profileError || !profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Customers have no mandatory-MFA concept (unlike staff's Admin/
    // Supervisor/Superadmin), so a trusted device is always eligible here.
    const mfaBypassed = parsed.data.device_token
      ? await isTrustedDevice(authData.user.id, parsed.data.device_token)
      : false;

    return res.status(200).json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      // Credentials are valid, so login still succeeds even when
      // deactivated - the client redirects to the deactivated-account
      // notice page instead of the portal, using this same session so its
      // REACTIVATE button can call the self-service activate endpoint
      // without a second login. Omitted entirely (not `false`) when active,
      // so the existing client contract for an active login is unchanged.
      ...(profile.is_active ? {} : { account_status: 'deactivated' as const }),
      ...(mfaBypassed ? { mfa_bypassed: true } : {}),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerMfaEnrollController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = customerMfaEnrollValidator.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    const userClient = getUserClient(req);
    const email = await getAuthUserEmail(userId);
    if (parsed.data.method === 'email' && !email) {
      return res.status(400).json({ error: 'Could not resolve account email' });
    }

    const result = await enrollMfaMethod(
      userClient,
      userId,
      parsed.data.method,
      email ?? ''
    );

    return res
      .status(200)
      .json(
        parsed.data.method === 'authenticator'
          ? { id: result.factorId, totp: result.totp }
          : { id: result.factorId, sent: true }
      );
  } catch (error) {
    return res
      .status(400)
      .json({ error: (error as Error).message ?? 'Failed to enroll' });
  }
}

export async function customerMfaEmailRequestCodeController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const email = await getAuthUserEmail(userId);
    if (!email) {
      return res.status(400).json({ error: 'Could not resolve account email' });
    }

    const result = await sendMfaEmailMethodCode(userId, email);

    if (result.status === 'not_configured') {
      return res.status(400).json({ error: 'Email method is not set up' });
    }

    if (result.status === 'rate_limited') {
      return res.status(429).json({
        error: 'Please wait before requesting another code.',
        retry_after_seconds: result.retryAfterSeconds,
      });
    }

    return res.status(200).json({ sent: true });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerMfaUnenrollController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = customerMfaUnenrollValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' });
  }

  try {
    const userClient = getUserClient(req);
    // Customers have no mandatory-MFA role, so unenrolling their only
    // method is always allowed - unlike staff's matching controller.
    const { error } = await unenrollMfaMethod(
      userClient,
      userId,
      parsed.data.method
    );

    if (error) {
      return res
        .status(400)
        .json({ error: 'Failed to remove MFA factor', details: error.message });
    }

    // See staffAuth.controller.ts's matching comment - removing a factor
    // invalidates any device trusted under the old configuration.
    await revokeAllTrustedDevices(userId);

    return res.status(200).json({ removed: true });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerMfaStatusController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userClient = getUserClient(req);
    const [methods, preferredMethod] = await Promise.all([
      getMfaMethodStatus(userClient, userId),
      getMfaPreference(userId),
    ]);

    return res.status(200).json({
      mfa_enrolled: methods.authenticator || methods.email,
      methods,
      preferred_method: preferredMethod,
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerMfaPreferenceController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = customerMfaPreferenceValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' });
  }

  try {
    await setMfaPreference(userId, parsed.data.preferred_method);
    return res
      .status(200)
      .json({ preferred_method: parsed.data.preferred_method });
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

  const { code, method, remember_device: rememberDevice } = parsed.data;

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
    const result = await challengeAndVerifyMfaMethod(
      userClient,
      userId,
      method,
      code
    );

    if (!result) {
      return res.status(400).json({ error: `No ${method} factor found` });
    }

    if (result.verifyError) {
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

    // Always eligible for customers (see customerLoginController's matching
    // comment) - no mandatory-role exclusion needed here.
    const deviceToken = rememberDevice
      ? await issueTrustedDeviceToken(userId)
      : null;

    if (refreshError || !refreshData.session) {
      return res.status(200).json({
        success: true,
        ...(deviceToken ? { device_token: deviceToken } : {}),
      });
    }

    return res.status(200).json({
      access_token: refreshData.session.access_token,
      refresh_token: refreshData.session.refresh_token,
      expires_in: refreshData.session.expires_in,
      ...(deviceToken ? { device_token: deviceToken } : {}),
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
    if (error instanceof MissingProviderEmailError) {
      return res.status(422).json({
        error:
          'Your account has no confirmed email address from this sign-in provider. Please confirm an email address with that provider, or sign in with a different method.',
      });
    }

    return res
      .status(500)
      .json({ error: error.message || 'Internal server error' });
  }
}
