import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  staffAuthValidator,
  totpValidator,
} from './modules/validators/staffAuth.validator.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';

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

    const { username, password } = parsed.data;

    // 1. Resolve registered_email from staff_profiles
    const { data: profileData, error: profileError } = await supabase
      .from('staff_profiles')
      .select('registered_email')
      .eq('username', username)
      .single();

    if (profileError || !profileData?.registered_email) {
      throw new Error('Profile resolution failed');
    }

    // 2. Sign in with Supabase Auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: profileData.registered_email,
        password,
      });

    if (authError || !authData.session) {
      throw new Error('Authentication failed');
    }

    return res.status(200).json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
    });
  } catch (err: unknown) {
    return res.status(401).json({ error: 'Unauthorized' }); // Per AC-6, generic 401
  }
}

export async function mfaEnrollController(
  req: AuthenticatedRequest,
  res: Response
) {
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
    const userClient = getUserClient(req);

    // List factors to get the TOTP factor
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
      return res.status(401).json({ error: 'Invalid code' });
    }

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
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(200).json({ message: 'Password reset email sent' });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
