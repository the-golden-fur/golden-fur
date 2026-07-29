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

const FONT_SIZE_PREFERENCES = ['small', 'medium', 'large', 'x-large'] as const;
type FontSizePreference = (typeof FONT_SIZE_PREFERENCES)[number];

function isFontSizePreference(value: unknown): value is FontSizePreference {
  return (
    typeof value === 'string' &&
    (FONT_SIZE_PREFERENCES as readonly string[]).includes(value)
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

  const {
    theme_preference: themePreference,
    font_size_preference: fontSizePreference,
  } = req.body ?? {};

  if (themePreference === undefined && fontSizePreference === undefined) {
    return res.status(400).json({ error: 'No preferences provided' });
  }
  if (themePreference !== undefined && !isThemePreference(themePreference)) {
    return res.status(400).json({ error: 'Invalid theme preference' });
  }
  if (
    fontSizePreference !== undefined &&
    !isFontSizePreference(fontSizePreference)
  ) {
    return res.status(400).json({ error: 'Invalid font size preference' });
  }

  const update: Record<string, string> = {};
  if (themePreference !== undefined) update.theme_preference = themePreference;
  if (fontSizePreference !== undefined)
    update.font_size_preference = fontSizePreference;

  try {
    const { data, error } = await getUserClient(req)
      .from('customer_profiles')
      .update(update)
      .eq('id', userId)
      .select('theme_preference, font_size_preference')
      .single();

    if (error || !data) {
      return res
        .status(400)
        .json({ error: error?.message || 'Failed to update preferences' });
    }

    return res.status(200).json({
      theme_preference: data.theme_preference,
      font_size_preference: data.font_size_preference,
    });
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
router.get('/customers/mfa/status', jwtMiddleware, customerMfaStatusController);
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
