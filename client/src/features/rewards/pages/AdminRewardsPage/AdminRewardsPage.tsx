import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archiveSpinWheelReward,
  createSpinWheelReward,
  listSpinWheelRewards,
  updateSpinWheelReward,
} from '../../api/rewards.api';
import { RarityBadge } from '../../components/RarityBadge/RarityBadge';
import {
  RARITY_TIERS,
  type DiscountValueType,
  type RarityTier,
  type SpinWheelReward,
} from '../../rewards.types';
import {
  applyRewardFilters,
  deriveRewardSortKey,
  matchesRewardQuery,
  REWARD_COMPARATORS,
  REWARD_FILTER_FIELDS,
  REWARD_GROUP_BY_AXES,
  REWARD_SORT_FIELDS,
} from './rewardBrowserFields';
import styles from './AdminRewardsPage.module.css';

/** Same list as REWARDS_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DISCOUNT_TYPES: DiscountValueType[] = ['Percentage', 'Flat'];

/** A sensible starting weight per tier when an admin picks a tier in the
 * form - only a suggestion (the weight field stays freely editable). */
const SUGGESTED_WEIGHT: Record<RarityTier, number> = {
  Common: 40,
  Uncommon: 20,
  Rare: 10,
  Epic: 5,
  Legendary: 2,
};

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function rewardValueLabel(reward: SpinWheelReward): string {
  return reward.discount_type === 'Percentage'
    ? `${reward.value}% off`
    : `PHP ${reward.value} off`;
}

function poolsLabel(reward: SpinWheelReward): string {
  const pools = reward.pools ?? [];
  if (pools.length === 0) return 'Not in any pool';
  return pools.map((pool) => pool.name).join(', ');
}

/**
 * Settings > Promos & Rewards > Rewards (session 114; was the Coupon Spin
 * Wheel subpage from session 86). The reward catalog every reward pool picks
 * from. Each reward has a rarity tier and a free weight - its actual %
 * chance is worked out per pool (weight / total weight of the pool's active
 * rewards), so adding or switching off a reward never requires rebalancing
 * the others. Trigger conditions and pity now live on each spin-wheel promo
 * (Promos tab), and pools on the Reward Pools tab.
 */
export function AdminRewardsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [rewards, setRewards] = useState<SpinWheelReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [rewardLabel, setRewardLabel] = useState('');
  const [rewardDiscountType, setRewardDiscountType] =
    useState<DiscountValueType>('Percentage');
  const [rewardValue, setRewardValue] = useState('');
  const [rewardTier, setRewardTier] = useState<RarityTier>('Common');
  const [rewardWeight, setRewardWeight] = useState(
    String(SUGGESTED_WEIGHT.Common)
  );
  const [rewardFormError, setRewardFormError] = useState<string | null>(null);
  const [isSavingReward, setIsSavingReward] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(REWARD_GROUP_BY_AXES[0].id);

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

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;
    void listSpinWheelRewards(accessToken, true).then((result) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load rewards.');
        return;
      }
      setRewards(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const handleRewardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;

    const value = Number(rewardValue);
    const weight = Number(rewardWeight);

    if (rewardLabel.trim() === '' || rewardValue === '' || value < 0) {
      setRewardFormError('A title and a non-negative value are required.');
      return;
    }
    if (rewardDiscountType === 'Percentage' && value > 100) {
      setRewardFormError('A percentage value cannot exceed 100.');
      return;
    }
    if (rewardWeight === '' || !(weight > 0)) {
      setRewardFormError('Weight must be a number greater than 0.');
      return;
    }

    setIsSavingReward(true);
    setRewardFormError(null);

    const payload = {
      label: rewardLabel.trim(),
      discount_type: rewardDiscountType,
      value,
      rarity_tier: rewardTier,
      weight,
    };

    const result = editingRewardId
      ? await updateSpinWheelReward(editingRewardId, accessToken, payload)
      : await createSpinWheelReward(accessToken, payload);

    setIsSavingReward(false);

    if (result.error || !result.data) {
      setRewardFormError(
        result.error ??
          `Could not ${editingRewardId ? 'update' : 'create'} the reward.`
      );
      return;
    }

    const saved = result.data as SpinWheelReward;
    setRewards((prev) =>
      editingRewardId
        ? prev.map((item) => (item.id === editingRewardId ? saved : item))
        : [...prev, saved]
    );
    setMessage(editingRewardId ? 'Reward updated.' : 'Reward added.');
    setIsRewardModalOpen(false);
    setEditingRewardId(null);
  };

  function openCreateModal() {
    setEditingRewardId(null);
    setRewardLabel('');
    setRewardDiscountType('Percentage');
    setRewardValue('');
    setRewardTier('Common');
    setRewardWeight(String(SUGGESTED_WEIGHT.Common));
    setRewardFormError(null);
    setIsRewardModalOpen(true);
  }

  function openEditModal(reward: SpinWheelReward) {
    setEditingRewardId(reward.id);
    setRewardLabel(reward.label);
    setRewardDiscountType(reward.discount_type);
    setRewardValue(String(reward.value));
    setRewardTier(reward.rarity_tier);
    setRewardWeight(String(reward.weight));
    setRewardFormError(null);
    setIsRewardModalOpen(true);
  }

  function closeRewardModal() {
    setIsRewardModalOpen(false);
    setEditingRewardId(null);
    setRewardFormError(null);
  }

  function handleTierChange(tier: RarityTier) {
    // Only nudge the weight while it still holds the previous tier's
    // suggestion - never overwrite a number the admin typed themselves.
    if (rewardWeight === String(SUGGESTED_WEIGHT[rewardTier])) {
      setRewardWeight(String(SUGGESTED_WEIGHT[tier]));
    }
    setRewardTier(tier);
  }

  const handleToggleActive = async (reward: SpinWheelReward) => {
    if (!accessToken) return;

    const result = await updateSpinWheelReward(reward.id, accessToken, {
      is_active: !reward.is_active,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the reward.');
      return;
    }

    setRewards((prev) =>
      prev.map((item) =>
        item.id === reward.id ? (result.data as SpinWheelReward) : item
      )
    );
    setMessage(reward.is_active ? 'Reward deactivated.' : 'Reward activated.');
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

  const visibleRewards = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? rewards.filter((reward) => matchesRewardQuery(reward, query))
      : rewards;
    const filtered = applyRewardFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      REWARD_COMPARATORS[deriveRewardSortKey(sortTile)]
    );
  }, [rewards, search, filterTiles, sortTile]);

  const activeGroupAxis =
    REWARD_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedRewards = useGroupBy(
    visibleRewards,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = REWARD_FILTER_FIELDS.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  function renderRewardActions(reward: SpinWheelReward) {
    return (
      <span className={styles.rewardActions}>
        <MoreOptionsMenu
          label={`Actions for ${reward.label}`}
          items={[
            { label: 'Configure', onSelect: () => openEditModal(reward) },
            {
              label: reward.is_active ? 'Deactivate' : 'Activate',
              onSelect: () => void handleToggleActive(reward),
            },
            ...(!reward.is_active
              ? [
                  {
                    label: 'Archive',
                    onSelect: () => void handleArchive(reward),
                  },
                ]
              : []),
          ]}
        />
      </span>
    );
  }

  const rewardColumns: DataTableColumn<SpinWheelReward>[] = [
    { id: 'label', header: 'Title', render: (reward) => reward.label },
    {
      id: 'rarity',
      header: 'Rarity',
      render: (reward) => <RarityBadge tier={reward.rarity_tier} />,
    },
    { id: 'weight', header: 'Weight', render: (reward) => reward.weight },
    {
      id: 'value',
      header: 'Reward',
      render: (reward) => rewardValueLabel(reward),
    },
    { id: 'pools', header: 'Pools', render: (reward) => poolsLabel(reward) },
    {
      id: 'status',
      header: 'Status',
      render: (reward) => (reward.is_active ? 'Active' : 'Inactive'),
    },
  ];

  function renderRewardCard(reward: SpinWheelReward) {
    return (
      <>
        <span className={styles.cardMain}>
          <span>
            {reward.label}
            {reward.is_active ? '' : ' (inactive)'}
          </span>
          <span className={styles.cardMeta}>
            <RarityBadge tier={reward.rarity_tier} /> weight {reward.weight}
            {' · '}
            {rewardValueLabel(reward)}
            {' · '}
            {poolsLabel(reward)}
          </span>
        </span>
        {renderRewardActions(reward)}
      </>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the rewards panel.
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

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading rewards...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Rewards</h1>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={openCreateModal}
          >
            Add New Reward
          </button>
        </div>
        <p className={styles.copy}>
          Every reward a spin wheel can land on. Give each one a rarity and a
          weight - a bigger weight means more likely. Its actual % chance is
          worked out automatically inside each reward pool, so you never have to
          make anything add up to 100%.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <FilterSortBar
          filterFields={REWARD_FILTER_FIELDS}
          filterTiles={filterTiles}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
          sortFields={REWARD_SORT_FIELDS}
          sortTile={sortTile}
          onChangeSort={setSortTile}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search rewards..."
        >
          <div className={styles.viewControls}>
            <ViewSwitcher
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Rewards view"
            />
            {view === 'board' ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Group by</span>
                <select
                  className={styles.input}
                  value={groupAxisId}
                  onChange={(event) => setGroupAxisId(event.target.value)}
                  aria-label="Group by"
                >
                  {REWARD_GROUP_BY_AXES.map((axis) => (
                    <option key={axis.id} value={axis.id}>
                      {axis.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </FilterSortBar>

        {view === 'table' ? (
          <DataTable
            columns={rewardColumns}
            rows={visibleRewards}
            getRowKey={(reward) => reward.id}
            renderRowActions={renderRewardActions}
            emptyMessage="No rewards match this filter."
          />
        ) : view === 'list' ? (
          <DataList
            items={visibleRewards}
            getRowKey={(reward) => reward.id}
            renderItem={(reward) => (
              <div className={styles.rewardRow}>{renderRewardCard(reward)}</div>
            )}
            emptyMessage="No rewards match this filter."
          />
        ) : (
          <DataBoard
            groups={groupedRewards}
            getRowKey={(reward) => reward.id}
            renderCard={(reward) => (
              <div className={styles.rewardCard}>
                {renderRewardCard(reward)}
              </div>
            )}
            emptyColumnMessage="No rewards here."
          />
        )}
      </div>

      <Modal
        isOpen={isRewardModalOpen}
        title={editingRewardId ? 'Edit reward' : 'Add New Reward'}
        onClose={closeRewardModal}
      >
        <form className={styles.form} onSubmit={handleRewardSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input
              className={styles.input}
              type="text"
              value={rewardLabel}
              onChange={(event) => setRewardLabel(event.target.value)}
              placeholder="e.g. 10% off your next booking"
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
              max={rewardDiscountType === 'Percentage' ? 100 : undefined}
              step="0.01"
              value={rewardValue}
              onChange={(event) => setRewardValue(event.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Rarity</span>
            <select
              className={styles.input}
              value={rewardTier}
              onChange={(event) =>
                handleTierChange(event.target.value as RarityTier)
              }
            >
              {RARITY_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Weight (chance)</span>
            <input
              className={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              value={rewardWeight}
              onChange={(event) => setRewardWeight(event.target.value)}
              required
            />
            <span className={styles.hint}>
              Bigger = more likely. A reward with weight 20 is twice as likely
              as one with weight 10 in the same pool. The % chance is shown on
              the Reward Pools tab.
            </span>
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
            {isSavingReward
              ? 'Saving...'
              : editingRewardId
                ? 'Save changes'
                : 'Add reward'}
          </button>
        </form>
      </Modal>
    </main>
  );
}
