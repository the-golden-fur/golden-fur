import { getSupabaseClient } from '../auth/api/auth.api';
import type {
  ColorMode,
  ThemeRole,
} from '../providers/ThemeProvider/themeContext';

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

  const { data, error } = await client
    .from(PROFILE_TABLE_BY_ROLE[role])
    .select('theme_preference')
    .eq('id', userId)
    .single();

  if (error || !data?.theme_preference) {
    return null;
  }

  return data.theme_preference as ColorMode;
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
