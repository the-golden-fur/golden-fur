import { Router, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  customerSignupController,
  customerLoginController,
  customerMfaEnrollController,
  customerMfaVerifyController,
  customerMfaStatusController,
  customerMfaUnenrollController,
  customerOauthCallbackController,
} from './customerAuth.controller.ts';
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

export async function customerPreferencesController(
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
      .from('customer_profiles')
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

router.post('/customers/signup', customerSignupController);
router.post('/customers/login', customerLoginController);
router.post(
  '/customers/mfa/enroll',
  jwtMiddleware,
  customerMfaEnrollController
);
router.post(
  '/customers/mfa/verify',
  jwtMiddleware,
  customerMfaVerifyController
);
router.get(
  '/customers/mfa/status',
  jwtMiddleware,
  customerMfaStatusController
);
router.post(
  '/customers/mfa/unenroll',
  jwtMiddleware,
  customerMfaUnenrollController
);
router.post('/customers/oauth/callback', customerOauthCallbackController);
router.patch(
  '/customers/preferences',
  jwtMiddleware,
  customerPreferencesController
);

export default router;
