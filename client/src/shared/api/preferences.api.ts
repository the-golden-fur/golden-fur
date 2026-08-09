import { getSupabaseClient } from '../auth/api/auth.api';
import type {
  ColorMode,
  FontSizePreference,
  ThemeRole,
} from '../providers/ThemeProvider/themeContext';
import type { NotificationEventType } from '../../features/notifications/notifications.types';

interface PreferencesApiResult<T> {
  data: T | null;
  error: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_PREFIX = '/auth';

const PROFILE_TABLE_BY_ROLE: Record<ThemeRole, string> = {
  staff: 'staff_profiles',
  customer: 'customer_profiles',
};

const PREFERENCES_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/preferences',
  customer: '/customers/preferences',
};

export async function getThemePreference(
  role: ThemeRole,
  userId: string
): Promise<ColorMode | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  // maybeSingle(), not single(): the guard for this route may not have
  // resolved yet (or this is a cross-role session on its way to being signed
  // out), so a 0-row match is an expected "no preference yet" case, not a
  // 406-worthy error.
  const { data, error } = await client
    .from(PROFILE_TABLE_BY_ROLE[role])
    .select('theme_preference')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data?.theme_preference) {
    return null;
  }

  return data.theme_preference as ColorMode;
}

export type NotificationChannel = 'email' | 'in_browser';

export interface NotificationChannelPreference {
  email: boolean;
  in_browser: boolean;
  /** Only ever set on the 'appointment_reminder' entry - see
   * REMINDER_OFFSET_MINUTES_OPTIONS. */
  reminder_offset_minutes?: number;
}

export type NotificationPreferences = Record<
  NotificationEventType,
  NotificationChannelPreference
>;

/** Mirrors the server's REMINDER_OFFSET_MINUTES_OPTIONS
 * (notifications.types.ts) - "how long before the appointment should the
 * reminder fire". 1440 (1 day before) is the pre-existing fixed default. */
export const REMINDER_OFFSET_MINUTES_OPTIONS = [
  15, 60, 180, 1440, 2880,
] as const;
export const DEFAULT_REMINDER_OFFSET_MINUTES = 1440;

export const REMINDER_OFFSET_LABELS: Record<number, string> = {
  15: '15 minutes before',
  60: '1 hour before',
  180: '3 hours before',
  1440: '1 day before',
  2880: '2 days before',
};

const NOTIFICATION_PREFERENCES_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/notification-preferences',
  customer: '/customers/notification-preferences',
};

export async function getNotificationPreferences(
  role: ThemeRole,
  userId: string
): Promise<NotificationPreferences | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from(PROFILE_TABLE_BY_ROLE[role])
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data?.notification_preferences) {
    return null;
  }

  return data.notification_preferences as NotificationPreferences;
}

export async function getFontSizePreference(
  role: ThemeRole,
  userId: string
): Promise<FontSizePreference | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from(PROFILE_TABLE_BY_ROLE[role])
    .select('font_size_preference')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data?.font_size_preference) {
    return null;
  }

  return data.font_size_preference as FontSizePreference;
}

// Guards use this to confirm the signed-in user actually belongs to the
// portal they're navigating into - a customer and a staff member share the
// same Supabase Auth session, so "is there a session" alone can't tell them
// apart; only a matching profile row can.
export async function hasProfile(
  role: ThemeRole,
  userId: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  const { data } = await client
    .from(PROFILE_TABLE_BY_ROLE[role])
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  return data !== null;
}

export async function updateThemePreference(
  role: ThemeRole,
  accessToken: string,
  themePreference: ColorMode
): Promise<PreferencesApiResult<{ theme_preference: ColorMode }>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${PREFERENCES_PATH_BY_ROLE[role]}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ theme_preference: themePreference }),
    }
  );

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    theme_preference?: ColorMode;
  } | null;

  if (!response.ok) {
    return {
      data: null,
      error: body?.error ?? 'Request failed. Please try again.',
    };
  }

  return {
    data: { theme_preference: body?.theme_preference ?? themePreference },
    error: null,
  };
}

export async function updateFontSizePreference(
  role: ThemeRole,
  accessToken: string,
  fontSizePreference: FontSizePreference
): Promise<PreferencesApiResult<{ font_size_preference: FontSizePreference }>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${PREFERENCES_PATH_BY_ROLE[role]}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ font_size_preference: fontSizePreference }),
    }
  );

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    font_size_preference?: FontSizePreference;
  } | null;

  if (!response.ok) {
    return {
      data: null,
      error: body?.error ?? 'Request failed. Please try again.',
    };
  }

  return {
    data: {
      font_size_preference: body?.font_size_preference ?? fontSizePreference,
    },
    error: null,
  };
}

export async function updateNotificationPreference(
  role: ThemeRole,
  accessToken: string,
  eventType: NotificationEventType,
  channel: NotificationChannel,
  enabled: boolean
): Promise<PreferencesApiResult<NotificationPreferences>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${NOTIFICATION_PREFERENCES_PATH_BY_ROLE[role]}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ event_type: eventType, channel, enabled }),
    }
  );

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    notification_preferences?: NotificationPreferences;
  } | null;

  if (!response.ok || !body?.notification_preferences) {
    return {
      data: null,
      error: body?.error ?? 'Request failed. Please try again.',
    };
  }

  return { data: body.notification_preferences, error: null };
}

/** Customer-only (appointment_reminder is not a staff-facing event type) -
 * see customerNotificationPreferencesController's {reminder_offset_minutes}
 * request shape. */
export async function updateReminderOffset(
  accessToken: string,
  reminderOffsetMinutes: number
): Promise<PreferencesApiResult<NotificationPreferences>> {
  const response = await fetch(
    `${API_BASE_URL}${AUTH_PREFIX}${NOTIFICATION_PREFERENCES_PATH_BY_ROLE.customer}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        event_type: 'appointment_reminder',
        reminder_offset_minutes: reminderOffsetMinutes,
      }),
    }
  );

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    notification_preferences?: NotificationPreferences;
  } | null;

  if (!response.ok || !body?.notification_preferences) {
    return {
      data: null,
      error: body?.error ?? 'Request failed. Please try again.',
    };
  }

  return { data: body.notification_preferences, error: null };
}
