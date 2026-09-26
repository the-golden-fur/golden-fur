import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  RARITY_TIERS,
  type RewardPool,
  type SpinWheelReward,
} from '../../rewards.types';
import {
  computeChances,
  formatChance,
  rarestTier,
  tierRank,
} from '../../utils/rewardChance';
import { RarityBadge } from '../RarityBadge/RarityBadge';
import styles from './RewardPoolBuilderModal.module.css';

export interface RewardPoolFormValues {
  name: string;
  description: string | null;
  reward_ids: string[];
}

interface RewardPoolBuilderModalProps {
  isOpen: boolean;
  /** null = create a new pool. */
  pool: RewardPool | null;
  /** The full (non-archived) reward catalog, active and inactive. */
  rewards: SpinWheelReward[];
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: RewardPoolFormValues) => void;
}

function rewardValueLabel(reward: SpinWheelReward): string {
  return reward.discount_type === 'Percentage'
    ? `${reward.value}% off`
    : `PHP ${reward.value} off`;
}

/**
 * Session 114: "Add New Reward Pool > reward pool builder form". Pick a
 * name, tick rewards from the catalog (grouped rarest tier first), and see
 * each selected reward's % chance recalculate live - chance is
 * weight / total weight of the pool's active rewards, so nothing ever has
 * to be balanced to 100 by hand.
 *
 * Mount with a fresh `key` per open (the parent does) so the form state
 * always starts from the pool being edited.
 */
export function RewardPoolBuilderModal({
  isOpen,
  pool,
  rewards,
  isSaving,
  error,
  onClose,
  onSave,
}: RewardPoolBuilderModalProps) {
  const [name, setName] = useState(pool?.name ?? '');
  const [description, setDescription] = useState(pool?.description ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    pool?.rewards.map((reward) => reward.id) ?? []
  );
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const rewardsByTier = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = query
      ? rewards.filter((reward) => reward.label.toLowerCase().includes(query))
      : rewards;

    return [...RARITY_TIERS]
      .sort((a, b) => tierRank(a) - tierRank(b))
      .map((tier) => ({
        tier,
        rewards: matching
          .filter((reward) => reward.rarity_tier === tier)
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .filter((group) => group.rewards.length > 0);
  }, [rewards, search]);

  const selectedWithChance = useMemo(() => {
    const selected = rewards.filter((reward) =>
      selectedIds.includes(reward.id)
    );
    return computeChances(selected).sort(
      (a, b) =>
        tierRank(a.rarity_tier) - tierRank(b.rarity_tier) ||
        a.label.localeCompare(b.label)
    );
  }, [rewards, selectedIds]);

  const pityTier = rarestTier(selectedWithChance);
  const activeSelectedCount = selectedWithChance.filter(
    (reward) => reward.chance_percent > 0
  ).length;

  function toggleReward(rewardId: string) {
    setSelectedIds((prev) =>
      prev.includes(rewardId)
        ? prev.filter((id) => id !== rewardId)
        : [...prev, rewardId]
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim() === '') {
      setFormError('Give the pool a name.');
      return;
    }

    setFormError(null);
    onSave({
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      reward_ids: selectedIds,
    });
  }

  return (
    <Modal
      isOpen={isOpen}
      title={pool ? 'Edit reward pool' : 'Add New Reward Pool'}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Pool name</span>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Rare Rewards"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Description (optional)</span>
          <input
            className={styles.input}
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.fieldLabel}>Rewards in this pool</legend>
          <input
            className={styles.input}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rewards..."
            aria-label="Search rewards to add"
          />

          {rewards.length === 0 ? (
            <p className={styles.hint}>
              There are no rewards yet - add some on the Rewards tab first.
            </p>
          ) : rewardsByTier.length === 0 ? (
            <p className={styles.hint}>No rewards match your search.</p>
          ) : (
            <div className={styles.checklist}>
              {rewardsByTier.map((group) => (
                <div key={group.tier} className={styles.tierGroup}>
                  <RarityBadge tier={group.tier} />
                  {group.rewards.map((reward) => (
                    <label key={reward.id} className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(reward.id)}
                        onChange={() => toggleReward(reward.id)}
                      />
                      <span>{reward.label}</span>
                      <span className={styles.muted}>
                        {rewardValueLabel(reward)} · weight {reward.weight}
                        {reward.is_active ? '' : ' · inactive'}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <section className={styles.preview} aria-label="Chance preview">
          <h3 className={styles.previewTitle}>Chance of landing</h3>
          {selectedWithChance.length === 0 ? (
            <p className={styles.hint}>
              Tick some rewards to see their chances.
            </p>
          ) : (
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th scope="col">Reward</th>
                  <th scope="col">Rarity</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Chance</th>
                </tr>
              </thead>
              <tbody>
                {selectedWithChance.map((reward) => (
                  <tr
                    key={reward.id}
                    className={
                      reward.chance_percent === 0 ? styles.inactiveRow : ''
                    }
                  >
                    <td>{reward.label}</td>
                    <td>
                      <RarityBadge tier={reward.rarity_tier} />
                    </td>
                    <td>{reward.weight}</td>
                    <td>
                      {reward.chance_percent === 0
                        ? 'Inactive'
                        : formatChance(reward.chance_percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeSelectedCount === 0 ? (
            <p className={styles.warning} role="status">
              This pool has no active rewards, so a spin wheel promo using it
              can't be switched on yet.
            </p>
          ) : pityTier ? (
            <p className={styles.hint}>
              Pity (if a promo turns it on) guarantees a{' '}
              <strong>{pityTier}</strong> reward - the rarest tier in this pool.
            </p>
          ) : null}
        </section>

        {formError || error ? (
          <p className={styles.errorBanner} role="alert">
            {formError ?? error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : pool ? 'Save pool' : 'Create pool'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
