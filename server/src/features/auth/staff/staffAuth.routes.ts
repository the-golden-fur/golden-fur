import { Router, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  staffLoginController,
  mfaEnrollController,
  mfaVerifyController,
  forgotPasswordController,
} from './staffAuth.controller.ts';
import { jwtMiddleware } from '../../../shared/auth/middleware/jwt/jwt.middleware.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';

const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
type ThemePreference = (typeof THEME_PREFERENCES)[number];

function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

function getUserClient(req: AuthenticatedRequest) {
  const authHeader = req.headers.authorization;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader || '' } } }
  );
}

export async function staffPreferencesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const themePreference = req.body?.theme_preference;
  if (!isThemePreference(themePreference)) {
    return res.status(400).json({ error: 'Invalid theme preference' });
  }

  try {
    const { data, error } = await getUserClient(req)
      .from('staff_profiles')
      .update({ theme_preference: themePreference })
      .eq('id', userId)
      .select('theme_preference')
      .single();

    if (error || !data) {
      return res
        .status(400)
        .json({ error: error?.message || 'Failed to update preferences' });
    }

    return res.status(200).json({ theme_preference: data.theme_preference });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const router = Router();

router.post('/staff/login', staffLoginController);
router.post('/staff/mfa/enroll', jwtMiddleware, mfaEnrollController);
router.post('/staff/mfa/verify', jwtMiddleware, mfaVerifyController);
router.post('/staff/forgot-password', forgotPasswordController);
router.patch('/staff/preferences', jwtMiddleware, staffPreferencesController);

export default router;
