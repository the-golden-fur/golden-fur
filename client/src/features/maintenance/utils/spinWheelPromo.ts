import type {
  Promo,
  SpinLoginTrigger,
  SpinWheelPromoSettings,
  SpinWheelSettingsInput,
} from '../maintenance.types';

/**
 * Session 114: form-state helpers for the "Coupon spin wheel" promo type
 * (SpinWheelPromoFields) plus a one-line trigger summary shared by the
 * promo list views.
 *
 * Trigger rules (mirrors the server's spinWheelSettingsProblems and the
 * spin_wheel_promo_settings CHECKs):
 *   - at least one trigger: every X completed bookings, a single payment of
 *     at least PHP X, or a login condition;
 *   - the booking and payment triggers combine freely;
 *   - only ONE login condition per promo (daily login, weekly streak, or
 *     monthly streak) - enforced in the UI by a radio group;
 *   - weekly streak = 1-7 days, monthly streak = 1-31 days.
 */

export type LoginTriggerChoice = 'none' | SpinLoginTrigger;

export interface SpinWheelFormState {
  poolId: string;
  bookingsEnabled: boolean;
  bookingsInterval: string;
  spendEnabled: boolean;
  spendAmount: string;
  loginTrigger: LoginTriggerChoice;
  streakDays: string;
  pityEnabled: boolean;
  pityThreshold: string;
}

export const LOGIN_TRIGGER_LABELS: Record<SpinLoginTrigger, string> = {
  daily_login: 'Daily login',
  weekly_login_streak: 'Weekly login streak',
  monthly_login_streak: 'Monthly login streak',
};

export const STREAK_MAX_DAYS: Record<
  'weekly_login_streak' | 'monthly_login_streak',
  number
> = {
  weekly_login_streak: 7,
  monthly_login_streak: 31,
};

export function emptySpinWheelForm(): SpinWheelFormState {
  return {
    poolId: '',
    bookingsEnabled: true,
    bookingsInterval: '5',
    spendEnabled: false,
    spendAmount: '',
    loginTrigger: 'none',
    streakDays: '',
    pityEnabled: true,
    pityThreshold: '10',
  };
}

export function spinWheelFormFromSettings(
  settings: SpinWheelPromoSettings | null | undefined
): SpinWheelFormState {
  if (!settings) return emptySpinWheelForm();

  return {
    poolId: settings.reward_pool_id,
    bookingsEnabled: settings.booking_milestone_interval != null,
    bookingsInterval:
      settings.booking_milestone_interval != null
        ? String(settings.booking_milestone_interval)
        : '5',
    spendEnabled: settings.spend_threshold_amount != null,
    spendAmount:
      settings.spend_threshold_amount != null
        ? String(Number(settings.spend_threshold_amount))
        : '',
    loginTrigger: settings.login_trigger ?? 'none',
    streakDays:
      settings.login_streak_days != null
        ? String(settings.login_streak_days)
        : '',
    pityEnabled: settings.pity_threshold != null,
    pityThreshold:
      settings.pity_threshold != null ? String(settings.pity_threshold) : '10',
  };
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isInteger(parsed) && parsed > 0;
}

/** Validates the form and turns it into the API's settings payload. Every
 * disabled trigger is sent as an explicit null so an edit can switch one
 * off. */
export function spinWheelFormToInput(
  form: SpinWheelFormState
):
  | { input: SpinWheelSettingsInput; error: null }
  | { input: null; error: string } {
  if (!form.poolId) {
    return { input: null, error: 'Choose a reward pool for this spin wheel.' };
  }

  const hasTrigger =
    form.bookingsEnabled || form.spendEnabled || form.loginTrigger !== 'none';

  if (!hasTrigger) {
    return {
      input: null,
      error: 'Turn on at least one trigger condition.',
    };
  }

  if (form.bookingsEnabled && !isPositiveInteger(form.bookingsInterval)) {
    return {
      input: null,
      error: 'Completed bookings must be a whole number of 1 or more.',
    };
  }

  if (form.spendEnabled && !(Number(form.spendAmount) > 0)) {
    return {
      input: null,
      error: 'The single-payment amount must be more than 0.',
    };
  }

  let streakDays: number | null = null;

  if (
    form.loginTrigger === 'weekly_login_streak' ||
    form.loginTrigger === 'monthly_login_streak'
  ) {
    const max = STREAK_MAX_DAYS[form.loginTrigger];
    const days = Number(form.streakDays);

    if (!isPositiveInteger(form.streakDays) || days > max) {
      return {
        input: null,
        error: `A ${form.loginTrigger === 'weekly_login_streak' ? 'weekly' : 'monthly'} streak needs 1 to ${max} days in a row.`,
      };
    }

    streakDays = days;
  }

  if (form.pityEnabled && !isPositiveInteger(form.pityThreshold)) {
    return {
      input: null,
      error: 'Pity must be a whole number of spins, 1 or more.',
    };
  }

  return {
    error: null,
    input: {
      reward_pool_id: form.poolId,
      booking_milestone_interval: form.bookingsEnabled
        ? Number(form.bookingsInterval)
        : null,
      spend_threshold_amount: form.spendEnabled
        ? Number(form.spendAmount)
        : null,
      login_trigger: form.loginTrigger === 'none' ? null : form.loginTrigger,
      login_streak_days: streakDays,
      pity_threshold: form.pityEnabled ? Number(form.pityThreshold) : null,
    },
  };
}

/** "every 5 completed bookings, payment of PHP 5000+, 5-day monthly login
 * streak" - the trigger summary shown on promo cards/rows. */
export function describeSpinTriggers(
  settings: SpinWheelPromoSettings | null | undefined
): string {
  if (!settings) return 'No triggers set';

  const parts: string[] = [];

  if (settings.booking_milestone_interval != null) {
    parts.push(
      settings.booking_milestone_interval === 1
        ? 'every completed booking'
        : `every ${settings.booking_milestone_interval} completed bookings`
    );
  }

  if (settings.spend_threshold_amount != null) {
    parts.push(
      `single payment of PHP ${Number(settings.spend_threshold_amount)}+`
    );
  }

  if (settings.login_trigger === 'daily_login') {
    parts.push('daily login');
  } else if (settings.login_trigger === 'weekly_login_streak') {
    parts.push(`${settings.login_streak_days}-day login streak (weekly)`);
  } else if (settings.login_trigger === 'monthly_login_streak') {
    parts.push(`${settings.login_streak_days}-day login streak (monthly)`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No triggers set';
}

/** "Spin wheel · Standard" for a spin-wheel promo's value cell/badge. */
export function spinWheelValueLabel(promo: Promo): string {
  const poolName = promo.spin_wheel_promo_settings?.reward_pools?.name;
  return poolName ? `Spin wheel · ${poolName}` : 'Spin wheel';
}
