import type { RewardPool } from '../../../rewards/rewards.types';
import type { SpinLoginTrigger } from '../../maintenance.types';
import {
  LOGIN_TRIGGER_LABELS,
  STREAK_MAX_DAYS,
  type LoginTriggerChoice,
  type SpinWheelFormState,
} from '../../utils/spinWheelPromo';
import styles from './SpinWheelPromoFields.module.css';

interface SpinWheelPromoFieldsProps {
  value: SpinWheelFormState;
  onChange: (next: SpinWheelFormState) => void;
  pools: RewardPool[];
}

const LOGIN_CHOICES: LoginTriggerChoice[] = [
  'none',
  'daily_login',
  'weekly_login_streak',
  'monthly_login_streak',
];

const LOGIN_CHOICE_HINTS: Record<LoginTriggerChoice, string> = {
  none: "Logging in doesn't earn spins",
  daily_login: 'One spin the first time they log in each day',
  weekly_login_streak:
    'One spin per week, once they log in this many days in a row (Mon-Sun)',
  monthly_login_streak:
    'One spin per month, once they log in this many days in a row',
};

function isStreak(
  choice: LoginTriggerChoice
): choice is 'weekly_login_streak' | 'monthly_login_streak' {
  return choice === 'weekly_login_streak' || choice === 'monthly_login_streak';
}

/**
 * Session 114: the "Coupon spin wheel" promo type's own fields in the promo
 * builder wizard - reward pool, trigger conditions, and pity.
 *
 * The booking and payment triggers are independent checkboxes (they
 * combine freely). The three login conditions are a single radio group, so
 * "some conditions should not be able to be enabled at the same time" holds
 * by construction - picking "Weekly login streak" automatically turns
 * "Daily login" off.
 */
export function SpinWheelPromoFields({
  value,
  onChange,
  pools,
}: SpinWheelPromoFieldsProps) {
  const update = (patch: Partial<SpinWheelFormState>) =>
    onChange({ ...value, ...patch });

  const selectedPool = pools.find((pool) => pool.id === value.poolId);
  const selectablePools = pools.filter(
    (pool) => pool.is_active || pool.id === value.poolId
  );

  function selectLoginTrigger(choice: LoginTriggerChoice) {
    update({
      loginTrigger: choice,
      // Keep a typed streak length when switching weekly <-> monthly, but
      // clear it for none/daily (they don't take one).
      streakDays: isStreak(choice) ? value.streakDays : '',
    });
  }

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Reward pool</span>
        <select
          className={styles.input}
          value={value.poolId}
          onChange={(event) => update({ poolId: event.target.value })}
          required
        >
          <option value="">Choose a reward pool...</option>
          {selectablePools.map((pool) => (
            <option key={pool.id} value={pool.id}>
              {pool.name} ({pool.active_reward_count} active reward
              {pool.active_reward_count === 1 ? '' : 's'})
            </option>
          ))}
        </select>
        {pools.length === 0 ? (
          <span className={styles.warning}>
            There are no reward pools yet - create one on the Reward Pools tab
            first.
          </span>
        ) : selectedPool && selectedPool.active_reward_count === 0 ? (
          <span className={styles.warning}>
            This pool has no active rewards yet - add some on the Reward Pools
            tab before switching this spin wheel on.
          </span>
        ) : null}
      </label>

      <fieldset className={styles.fieldset}>
        <legend className={styles.fieldLabel}>
          When does a customer earn a spin?
        </legend>
        <p className={styles.hint}>
          Turn on one or more. The wheel pops up for the customer as soon as
          they earn a spin.
        </p>

        <div className={styles.triggerRow}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={value.bookingsEnabled}
              onChange={(event) =>
                update({ bookingsEnabled: event.target.checked })
              }
            />
            Every
          </label>
          <input
            className={styles.smallInput}
            type="number"
            min="1"
            step="1"
            aria-label="Completed bookings per spin"
            value={value.bookingsInterval}
            disabled={!value.bookingsEnabled}
            onChange={(event) =>
              update({ bookingsInterval: event.target.value })
            }
          />
          <span>completed bookings</span>
        </div>

        <div className={styles.triggerRow}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={value.spendEnabled}
              onChange={(event) =>
                update({ spendEnabled: event.target.checked })
              }
            />
            A single payment of at least PHP
          </label>
          <input
            className={styles.smallInput}
            type="number"
            min="0.01"
            step="0.01"
            aria-label="Single payment amount (PHP)"
            value={value.spendAmount}
            disabled={!value.spendEnabled}
            onChange={(event) => update({ spendAmount: event.target.value })}
          />
        </div>

        <div
          className={styles.loginGroup}
          role="radiogroup"
          aria-label="Login condition"
        >
          <span className={styles.subLabel}>
            Login condition (pick one - they can't be combined)
          </span>
          {LOGIN_CHOICES.map((choice) => (
            <div key={choice} className={styles.loginChoice}>
              <label className={styles.checkLabel}>
                <input
                  type="radio"
                  name="spin-login-trigger"
                  checked={value.loginTrigger === choice}
                  onChange={() => selectLoginTrigger(choice)}
                />
                {choice === 'none'
                  ? 'None'
                  : LOGIN_TRIGGER_LABELS[choice as SpinLoginTrigger]}
              </label>
              {isStreak(choice) && value.loginTrigger === choice ? (
                <span className={styles.triggerRow}>
                  <input
                    className={styles.smallInput}
                    type="number"
                    min="1"
                    max={STREAK_MAX_DAYS[choice]}
                    step="1"
                    aria-label="Days in a row"
                    value={value.streakDays}
                    onChange={(event) =>
                      update({ streakDays: event.target.value })
                    }
                  />
                  <span>days in a row (1-{STREAK_MAX_DAYS[choice]})</span>
                </span>
              ) : null}
              <span className={styles.hint}>{LOGIN_CHOICE_HINTS[choice]}</span>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.fieldLabel}>Pity system</legend>
        <div className={styles.triggerRow}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={value.pityEnabled}
              onChange={(event) =>
                update({ pityEnabled: event.target.checked })
              }
            />
            Guarantee
            {selectedPool?.rarest_tier
              ? ` a ${selectedPool.rarest_tier}`
              : ' the rarest'}{' '}
            reward after
          </label>
          <input
            className={styles.smallInput}
            type="number"
            min="1"
            step="1"
            aria-label="Pity threshold (spins)"
            value={value.pityThreshold}
            disabled={!value.pityEnabled}
            onChange={(event) => update({ pityThreshold: event.target.value })}
          />
          <span>spins in a row without one</span>
        </div>
      </fieldset>
    </div>
  );
}
