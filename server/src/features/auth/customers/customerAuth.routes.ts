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
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType,
  type NotificationPreferences,
} from '../../notifications/notifications.types.ts';

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

function isNotificationEventType(
  value: unknown
): value is NotificationEventType {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function isNotificationChannel(value: unknown): value is NotificationChannel {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_CHANNELS as readonly string[]).includes(value)
  );
}

/**
 * One event type + one channel per call, merged into the existing jsonb map
 * rather than replacing it wholesale - a client only ever has the subset of
 * event types relevant to its own role loaded (Settings > Preferences
 * filters by role), so a full-object PATCH would silently wipe out the
 * other role-irrelevant keys' stored values.
 */
export async function customerNotificationPreferencesController(
  req: AuthenticatedRequest,
  res: Response
) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event_type: eventType, channel, enabled } = req.body ?? {};

  if (!isNotificationEventType(eventType)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }
  if (!isNotificationChannel(channel)) {
    return res.status(400).json({ error: 'Invalid channel' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid enabled value' });
  }

  try {
    const client = getUserClient(req);
    const { data: existing, error: fetchError } = await client
      .from('customer_profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single();

    if (fetchError || !existing) {
      return res.status(400).json({
        error: fetchError?.message || 'Failed to load preferences',
      });
    }

    const current = existing.notification_preferences as
      | NotificationPreferences
      | undefined;

    const updated: NotificationPreferences = {
      ...current,
      [eventType]: {
        ...current?.[eventType],
        [channel]: enabled,
      },
    } as NotificationPreferences;

    const { data, error } = await client
      .from('customer_profiles')
      .update({ notification_preferences: updated })
      .eq('id', userId)
      .select('notification_preferences')
      .single();

    if (error || !data) {
      return res.status(400).json({
        error: error?.message || 'Failed to update preferences',
      });
    }

    return res
      .status(200)
      .json({ notification_preferences: data.notification_preferences });
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
router.patch(
  '/customers/notification-preferences',
  jwtMiddleware,
  customerNotificationPreferencesController
);

export default router;
