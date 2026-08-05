import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  staffAuthValidator,
  totpValidator,
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
  enrollTotpFactor,
  getTotpEnrollmentStatus,
  unenrollAllTotpFactors,
  findTotpFactorForVerify,
  getStaffRole,
} from '../../../shared/auth/api/supabaseAuth.api.ts';
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

    return res.status(200).json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
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
  try {
    const userClient = getUserClient(req);
    const { data, error } = await enrollTotpFactor(userClient);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function mfaUnenrollController(
  req: AuthenticatedRequest,
  res: Response
) {
  if (!req.user?.sub) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userClient = getUserClient(req);
    const { removed, failed, error } = await unenrollAllTotpFactors(userClient);

    if (error) {
      return res.status(400).json({ error: 'Failed to list factors' });
    }

    if (failed.length > 0 && removed.length === 0) {
      return res.status(400).json({
        error: 'Failed to remove MFA factor',
        details: failed,
      });
    }

    return res.status(200).json({ removed, failed });
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
    const [{ data: statusData, error: statusError }, { data: roleData }] =
      await Promise.all([
        getTotpEnrollmentStatus(userClient),
        getStaffRole(userId),
      ]);

    if (statusError || !statusData) {
      return res.status(400).json({ error: 'Failed to list factors' });
    }

    return res.status(200).json({
      role: roleData?.role ?? null,
      mfa_enrolled: statusData.enrolled,
    });
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

    const { data: totpFactor, error: factorsError } =
      await findTotpFactorForVerify(userClient);
    if (factorsError) {
      return res.status(400).json({ error: 'Failed to list factors' });
    }
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

    // Issue #97: password_reset has no Resend template (Supabase Auth just
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
