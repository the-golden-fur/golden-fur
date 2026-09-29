import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  staffAuthValidator,
  totpValidator,
  mfaEnrollValidator,
  mfaUnenrollValidator,
  mfaPreferenceValidator,
} from './modules/validators/staffAuth.validator.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';
import { parseAllowedOrigins } from '../../../shared/config/cors/cors.config.ts';
import {
  checkMfaLockout,
  formatMfaLockoutResponse,
  incrementMfaLockout,
  resetMfaLockout,
} from '../../../shared/services/mfaLockout/mfaLockout.service.ts';
import {
  resolveStaffLoginIdentifier,
  signInWithPassword,
  getStaffRole,
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
import { MANDATORY_MFA_ROLES } from '../../../shared/auth/mandatoryMfaRoles.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';

function getUserClient(req: Request) {
  const authHeader = req.headers.authorization;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader || '' } } }
  );
}

export async function staffLoginController(req: Request, res: Response) {
  try {
    const parsed = staffAuthValidator.safeParse(req.body);

    if (!parsed.success) {
      throw new Error('Invalid input');
    }

    const { identifier, password } = parsed.data;
    const email = await resolveStaffLoginIdentifier(identifier);

    const { data: authData, error: authError } = await signInWithPassword(
      email,
      password
    );

    if (authError || !authData.session) {
      throw new Error('Authentication failed');
    }

    // resolveStaffLoginIdentifier only resolves username -> email for
    // username-shaped input; an email-shaped identifier is passed straight
    // through with no staff_profiles check. Without this, a customer's own
    // email/password would log them into the staff portal.
    const { data: staffRole, error: roleError } = await getStaffRole(
      authData.user.id
    );

    if (roleError || !staffRole?.role) {
      throw new Error('Not a staff account');
    }

    // Issue #74: a resend only makes sense before the staff member's first
    // successful login (the temporary password is presumably changed by
    // then). Best-effort, non-blocking - wrapped defensively so it can never
    // affect the login response either synchronously or via a rejection.
    try {
      void supabase
        .from('staff_profiles')
        .update({
          temp_credential_ciphertext: null,
          temp_credential_iv: null,
        })
        .eq('id', authData.user.id)
        ?.then?.(undefined, (error: unknown) => {
          console.error('Failed to clear temp credential on login:', error);
        });
    } catch (error) {
      console.error('Failed to clear temp credential on login:', error);
    }

    // "Remember this device" can only ever skip re-showing the challenge
    // screen, never the server-side aal2 gate (requireMfa.middleware.ts) -
    // that gate can only be satisfied by a real Supabase MFA verify, which a
    // trusted-device token deliberately bypasses. Mandatory-MFA roles must
    // always freshly verify, so a device token is never even checked for
    // them - honoring one would leave the client thinking it's done while
    // every MFA-gated route still 403s.
    let mfaBypassed = false;
    if (parsed.data.device_token && !MANDATORY_MFA_ROLES.has(staffRole.role)) {
      mfaBypassed = await isTrustedDevice(
        authData.user.id,
        parsed.data.device_token
      );
    }

    return res.status(200).json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      ...(mfaBypassed ? { mfa_bypassed: true } : {}),
    });
  } catch (error) {
    console.error('Staff login error:', error);
    return res.status(401).json({ error: 'Unauthorized' }); // Per AC-6, generic 401
  }
}

export async function mfaEnrollController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = mfaEnrollValidator.safeParse(req.body);
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

export async function mfaEmailRequestCodeController(
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

export async function mfaUnenrollController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = mfaUnenrollValidator.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' });
  }

  try {
    const userClient = getUserClient(req);
    const { data: roleData } = await getStaffRole(userId);
    const staffRole = roleData?.role;

    if (staffRole && MANDATORY_MFA_ROLES.has(staffRole)) {
      // The authenticator-app factor is permanent for a mandatory-MFA role,
      // never just "not the last method" - unlike 'email' (a real TOTP
      // factor whose secret the server itself holds, encrypted, to compute
      // and send the code), the server never learns an authenticator
      // factor's secret at all. That asymmetry means a compromised
      // MFA_EMAIL_SECRET_KEY alone could otherwise leave the highest-
      // privilege roles' MFA entirely forgeable server-side if they were
      // ever allowed to drop down to email-only - see mfa_factor_methods'
      // migration comment. Enrollment already forces this role's first
      // factor to be 'authenticator' (MfaSetupModal/MfaEnrollPage), so this
      // is enforcement of an invariant that should already hold, not a
      // first-time gate.
      if (parsed.data.method === 'authenticator') {
        return res.status(409).json({
          error:
            'Your role requires an authenticator app and it cannot be removed. You can still add or remove email as an additional method.',
        });
      }

      const status = await getMfaMethodStatus(userClient, userId);
      if (!status.authenticator) {
        return res.status(409).json({
          error:
            'Your role requires MFA - set up an authenticator app before removing this method.',
        });
      }
    }

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

    // Removing a factor changes what "this account is verified" means -
    // a device trusted under the old configuration has no business staying
    // trusted (e.g. resetting a compromised factor should also kick out any
    // device an attacker had separately gotten trusted).
    await revokeAllTrustedDevices(userId);

    return res.status(200).json({ removed: true });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function mfaStatusController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userClient = getUserClient(req);
    const [methods, { data: roleData }, preferredMethod] = await Promise.all([
      getMfaMethodStatus(userClient, userId),
      getStaffRole(userId),
      getMfaPreference(userId),
    ]);

    return res.status(200).json({
      role: roleData?.role ?? null,
      // Kept alongside `methods` for every existing caller that only ever
      // checked a single boolean (StaffLoginForm's redirect decision, etc.) -
      // true whenever at least one method is enrolled.
      mfa_enrolled: methods.authenticator || methods.email,
      methods,
      preferred_method: preferredMethod,
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function mfaPreferenceController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = mfaPreferenceValidator.safeParse(req.body);
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

export async function mfaVerifyController(
  req: AuthenticatedRequest,
  res: Response
) {
  const parsed = totpValidator.safeParse(req.body);
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

    // Mandatory-MFA roles are excluded even if the checkbox was somehow
    // ticked - see staffLoginController's matching comment on why a trusted
    // device can never substitute for their real aal2 requirement.
    let deviceToken: string | null = null;
    if (rememberDevice) {
      const { data: roleData } = await getStaffRole(userId);
      if (roleData?.role && !MANDATORY_MFA_ROLES.has(roleData.role)) {
        deviceToken = await issueTrustedDeviceToken(userId);
      }
    }

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

export async function forgotPasswordController(req: Request, res: Response) {
  const email = req.body.email;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const clientOrigin = parseAllowedOrigins(
      process.env.CORS_ALLOWED_ORIGINS
    )[0];
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: clientOrigin
        ? `${clientOrigin}/staff/reset-password`
        : undefined,
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Issue #97: password_reset has no Brevo template (Supabase Auth just
    // sent the email itself, above) - only the in-app row is written here,
    // so the staff member sees "Password reset requested" in their inbox
    // even though the actual email came from Supabase, not us. Best-effort
    // and silent either way - a lookup miss (unregistered email) must not
    // change this endpoint's response, matching resetPasswordForEmail's own
    // generic response regardless of whether the address exists.
    try {
      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('registered_email', email)
        .maybeSingle();

      if (staffProfile) {
        await createNotification({
          recipientStaffId: staffProfile.id,
          eventType: 'password_reset',
          title: 'Password reset requested',
          message: 'A password reset was requested for your account.',
        });
      }
    } catch (notificationError) {
      console.error(
        'Failed to write password_reset notification:',
        notificationError
      );
    }

    return res.status(200).json({ message: 'Password reset email sent' });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
