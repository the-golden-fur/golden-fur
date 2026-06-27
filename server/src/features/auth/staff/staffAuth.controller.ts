import type { Request, Response } from 'express';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { staffAuthValidator } from './modules/validators/staffAuth.validator.ts';

export async function staffLoginController(req: Request, res: Response) {
  const parsed = staffAuthValidator.safeParse(req.body);

  if (!parsed.success) {
    return res.status(401).json({ error: 'Unauthorized' }); // Per AC-6, generic 401
  }

  const { username, password } = parsed.data;

  // TODO: booking-overlap check deferred to Sprint 2 — requires bookings table from M03
  try {
    // 1. Resolve registered_email from staff_profiles
    const { data: profileData, error: profileError } = await supabase
      .from('staff_profiles')
      .select('registered_email')
      .eq('username', username)
      .single();

    if (profileError || !profileData?.registered_email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: profileData.registered_email,
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
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
