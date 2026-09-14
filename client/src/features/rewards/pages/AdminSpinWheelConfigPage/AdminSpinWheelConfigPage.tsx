import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archiveSpinWheelReward,
  createSpinWheelReward,
  getSpinWheelConfig,
  listSpinWheelRewards,
  updateSpinWheelConfig,
  updateSpinWheelReward,
} from '../../api/rewards.api';
import type {
  DiscountValueType,
  SpinWheelConfig,
  SpinWheelReward,
} from '../../rewards.types';
import styles from './AdminSpinWheelConfigPage.module.css';

/** Same list as REWARDS_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DISCOUNT_TYPES: DiscountValueType[] = ['Percentage', 'Flat'];

/** Admin config for the coupon spin wheel (session 86): the
 * milestone/spend/pity thresholds, and CRUD on the reward pool - each
 * reward's %/flat amount and its rarity %, which the active set must sum to
 * 100 (enforced authoritatively by a deferred DB trigger; this page also
 * shows a live running sum as a client-side guard). */
export function AdminSpinWheelConfigPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [config, setConfig] = useState<SpinWheelConfig | null>(null);
  const [rewards, setRewards] = useState<SpinWheelReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [milestoneInterval, setMilestoneInterval] = useState('');
  const [spendThreshold, setSpendThreshold] = useState('');
  const [pityThreshold, setPityThreshold] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [rewardLabel, setRewardLabel] = useState('');
  const [rewardDiscountType, setRewardDiscountType] =
    useState<DiscountValueType>('Percentage');
  const [rewardValue, setRewardValue] = useState('');
  const [rewardRarity, setRewardRarity] = useState('');
  const [rewardFormError, setRewardFormError] = useState<string | null>(null);
  const [isSavingReward, setIsSavingReward] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;
    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;
      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  const refresh = () => {
    if (!accessToken) return;
    void Promise.all([
      getSpinWheelConfig(accessToken),
      listSpinWheelRewards(accessToken, true),
    ]).then(([configResult, rewardsResult]) => {
      setIsLoading(false);
      if (configResult.data) {
        setConfig(configResult.data);
        setMilestoneInterval(
          String(configResult.data.bookings_milestone_interval)
        );
        setSpendThreshold(String(configResult.data.spend_threshold_amount));
        setPityThreshold(String(configResult.data.pity_threshold));
      }
      if (rewardsResult.data) setRewards(rewardsResult.data);
    });
  };

  useEffect(() => {
    if (!isAllowedViewer) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAllowedViewer]);

  const activeRewards = rewards.filter((reward) => reward.is_active);
  const raritySum = activeRewards.reduce(
    (sum, reward) => sum + Number(reward.rarity_percent),
    0
  );

  const handleConfigSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;

    setIsSavingConfig(true);
    const result = await updateSpinWheelConfig(accessToken, {
      bookings_milestone_interval: Number(milestoneInterval),
      spend_threshold_amount: Number(spendThreshold),
      pity_threshold: Number(pityThreshold),
    });
    setIsSavingConfig(false);

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not save the spin wheel settings.');
      return;
    }

    setConfig(result.data);
    setMessage('Spin wheel settings saved.');
  };

  const handleRewardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;

    const value = Number(rewardValue);
    const rarity = Number(rewardRarity);

    if (rewardLabel.trim() === '' || rewardValue === '' || value < 0) {
      setRewardFormError('A label and a non-negative value are required.');
      return;
    }
    if (rewardRarity === '' || rarity <= 0 || rarity > 100) {
      setRewardFormError('Rarity must be a percentage between 0 and 100.');
      return;
    }

    setIsSavingReward(true);
    setRewardFormError(null);

    const result = await createSpinWheelReward(accessToken, {
      label: rewardLabel.trim(),
      discount_type: rewardDiscountType,
      value,
      rarity_percent: rarity,
    });

    setIsSavingReward(false);

    if (result.error || !result.data) {
      setRewardFormError(
        result.error ??
          'Could not create the reward - check the rarity total sums to 100.'
      );
      return;
    }

    setRewards((prev) => [...prev, result.data as SpinWheelReward]);
    setRewardLabel('');
    setRewardValue('');
    setRewardRarity('');
    setMessage('Reward added.');
  };

  const handleToggleActive = async (reward: SpinWheelReward) => {
    if (!accessToken) return;

    const result = await updateSpinWheelReward(reward.id, accessToken, {
      is_active: !reward.is_active,
    });

    if (result.error || !result.data) {
      setMessage(
        result.error ??
          'Could not update the reward - check the rarity total sums to 100.'
      );
      return;
    }

    setRewards((prev) =>
      prev.map((item) =>
        item.id === reward.id ? (result.data as SpinWheelReward) : item
      )
    );
  };

  const handleArchive = async (reward: SpinWheelReward) => {
    if (!accessToken) return;

    const result = await archiveSpinWheelReward(reward.id, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setRewards((prev) => prev.filter((item) => item.id !== reward.id));
    setMessage('Reward archived.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the spin wheel configuration panel.
        </p>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  if (isLoading || !config) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading spin wheel configuration...</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Coupon Spin Wheel</h1>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <section className={styles.formPanel}>
          <h2 className={styles.sectionTitle}>Thresholds &amp; pity</h2>
          <form className={styles.form} onSubmit={handleConfigSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Grant a spin every this many completed bookings
              </span>
              <input
                className={styles.input}
                type="number"
                min="1"
                step="1"
                value={milestoneInterval}
                onChange={(event) => setMilestoneInterval(event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Or grant a spin when one transaction totals at least (PHP)
              </span>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={spendThreshold}
                onChange={(event) => setSpendThreshold(event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Pity: guarantee the lowest-rarity reward after this many spins
                without one
              </span>
              <input
                className={styles.input}
                type="number"
                min="1"
                step="1"
                value={pityThreshold}
                onChange={(event) => setPityThreshold(event.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSavingConfig}
            >
              {isSavingConfig ? 'Saving...' : 'Save settings'}
            </button>
          </form>
        </section>

        <section className={styles.formPanel}>
          <h2 className={styles.sectionTitle}>Reward pool</h2>
          <p
            className={
              raritySum === 100 ? styles.rarityOk : styles.rarityWarning
            }
          >
            Active rewards' rarity adds up to {raritySum}% (must equal 100% for
            the wheel to work).
          </p>

          <ul className={styles.rewardList}>
            {rewards.map((reward) => (
              <li key={reward.id} className={styles.rewardCard}>
                <span>
                  {reward.label} -{' '}
                  {reward.discount_type === 'Percentage'
                    ? `${reward.value}%`
                    : `PHP ${reward.value}`}{' '}
                  off - {reward.rarity_percent}% chance
                </span>
                <span className={styles.rewardActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleToggleActive(reward)}
                  >
                    {reward.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleArchive(reward)}
                  >
                    Archive
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <h3 className={styles.subheading}>Add a reward</h3>
          <form className={styles.form} onSubmit={handleRewardSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Label</span>
              <input
                className={styles.input}
                type="text"
                value={rewardLabel}
                onChange={(event) => setRewardLabel(event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Discount type</span>
              <select
                className={styles.input}
                value={rewardDiscountType}
                onChange={(event) =>
                  setRewardDiscountType(event.target.value as DiscountValueType)
                }
              >
                {DISCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Value
                {rewardDiscountType === 'Percentage' ? ' (%)' : ' (PHP)'}
              </span>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={rewardValue}
                onChange={(event) => setRewardValue(event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Rarity (%)</span>
              <input
                className={styles.input}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rewardRarity}
                onChange={(event) => setRewardRarity(event.target.value)}
                required
              />
            </label>

            {rewardFormError ? (
              <p className={styles.errorBanner} role="alert">
                {rewardFormError}
              </p>
            ) : null}

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSavingReward}
            >
              {isSavingReward ? 'Saving...' : 'Add reward'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
