import { useEffect, useMemo, useState } from 'react';
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
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archiveRewardPool,
  createRewardPool,
  listRewardPools,
  listSpinWheelRewards,
  updateRewardPool,
} from '../../api/rewards.api';
import { RarityBadge } from '../../components/RarityBadge/RarityBadge';
import {
  RewardPoolBuilderModal,
  type RewardPoolFormValues,
} from '../../components/RewardPoolBuilderModal/RewardPoolBuilderModal';
import type { RewardPool, SpinWheelReward } from '../../rewards.types';
import { formatChance } from '../../utils/rewardChance';
import {
  applyPoolFilters,
  derivePoolSortKey,
  matchesPoolQuery,
  POOL_COMPARATORS,
  POOL_FILTER_FIELDS,
  POOL_GROUP_BY_AXES,
  POOL_SORT_FIELDS,
} from './rewardPoolBrowserFields';
import styles from './AdminRewardPoolsPage.module.css';

/** Same list as REWARDS_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function promosLabel(pool: RewardPool): string {
  if (pool.promos.length === 0) return 'Not used yet';
  return pool.promos.map((promo) => promo.name).join(', ');
}

/**
 * Settings > Promos & Rewards > Reward Pools (session 114). A reward pool is
 * a named set of rewards (e.g. "Standard", "Rare Rewards"); each spin-wheel
 * promo draws from exactly one. "Add New Reward Pool" opens the pool
 * builder, which shows every selected reward's % chance live.
 */
export function AdminRewardPoolsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [pools, setPools] = useState<RewardPool[]>([]);
  const [rewards, setRewards] = useState<SpinWheelReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<RewardPool | null>(null);
  const [builderKey, setBuilderKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(POOL_GROUP_BY_AXES[0].id);

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
    void Promise.all([
      listRewardPools(accessToken),
      listSpinWheelRewards(accessToken, true),
    ]).then(([poolsResult, rewardsResult]) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (poolsResult.error || !poolsResult.data) {
        setLoadError(poolsResult.error ?? 'Could not load reward pools.');
        return;
      }
      setPools(poolsResult.data);
      setRewards(rewardsResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  function replacePool(updated: RewardPool) {
    setPools((prev) =>
      prev.some((pool) => pool.id === updated.id)
        ? prev.map((pool) => (pool.id === updated.id ? updated : pool))
        : [...prev, updated]
    );
  }

  function openBuilder(pool: RewardPool | null) {
    setEditingPool(pool);
    setSaveError(null);
    setBuilderKey((key) => key + 1);
    setIsBuilderOpen(true);
  }

  function closeBuilder() {
    setIsBuilderOpen(false);
    setEditingPool(null);
    setSaveError(null);
  }

  async function handleSave(values: RewardPoolFormValues) {
    if (!accessToken) return;

    setIsSaving(true);
    setSaveError(null);

    const result = editingPool
      ? await updateRewardPool(editingPool.id, accessToken, values)
      : await createRewardPool(accessToken, values);

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not save the reward pool.');
      return;
    }

    replacePool(result.data);
    setMessage(editingPool ? 'Reward pool updated.' : 'Reward pool created.');
    closeBuilder();
  }

  async function handleToggleActive(pool: RewardPool) {
    if (!accessToken) return;

    const result = await updateRewardPool(pool.id, accessToken, {
      is_active: !pool.is_active,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the reward pool.');
      return;
    }

    replacePool(result.data);
    setMessage(
      pool.is_active ? 'Reward pool deactivated.' : 'Reward pool activated.'
    );
  }

  async function handleArchive(pool: RewardPool) {
    if (!accessToken) return;

    const result = await archiveRewardPool(pool.id, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setPools((prev) => prev.filter((item) => item.id !== pool.id));
    setMessage('Reward pool archived.');
  }

  const visiblePools = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? pools.filter((pool) => matchesPoolQuery(pool, query))
      : pools;
    const filtered = applyPoolFilters(searched, filterTiles);

    return [...filtered].sort(POOL_COMPARATORS[derivePoolSortKey(sortTile)]);
  }, [pools, search, filterTiles, sortTile]);

  const activeGroupAxis =
    POOL_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedPools = useGroupBy(
    visiblePools,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = POOL_FILTER_FIELDS.find((f) => f.id === fieldId);
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

  function renderPoolActions(pool: RewardPool) {
    return (
      <MoreOptionsMenu
        label={`Actions for ${pool.name}`}
        items={[
          { label: 'Configure', onSelect: () => openBuilder(pool) },
          {
            label: pool.is_active ? 'Deactivate' : 'Activate',
            onSelect: () => void handleToggleActive(pool),
          },
          ...(!pool.is_active
            ? [{ label: 'Archive', onSelect: () => void handleArchive(pool) }]
            : []),
        ]}
      />
    );
  }

  function renderRewardSummary(pool: RewardPool) {
    const landable = pool.rewards.filter((reward) => reward.chance_percent > 0);
    if (landable.length === 0) {
      return <span className={styles.warning}>No active rewards</span>;
    }
    return (
      <span className={styles.rewardSummary}>
        {landable
          .map(
            (reward) =>
              `${reward.label} (${formatChance(reward.chance_percent)})`
          )
          .join(', ')}
      </span>
    );
  }

  const poolColumns: DataTableColumn<RewardPool>[] = [
    { id: 'name', header: 'Name', render: (pool) => pool.name },
    {
      id: 'rewards',
      header: 'Rewards (chance)',
      render: (pool) => renderRewardSummary(pool),
    },
    {
      id: 'rarest',
      header: 'Rarest tier',
      render: (pool) =>
        pool.rarest_tier ? <RarityBadge tier={pool.rarest_tier} /> : '-',
    },
    { id: 'promos', header: 'Used by', render: (pool) => promosLabel(pool) },
    {
      id: 'status',
      header: 'Status',
      render: (pool) => (pool.is_active ? 'Active' : 'Inactive'),
    },
  ];

  function renderPoolCard(pool: RewardPool) {
    return (
      <>
        <span className={styles.cardMain}>
          <span className={styles.cardTitle}>
            {pool.name}
            {pool.is_active ? '' : ' (inactive)'}
            {pool.rarest_tier ? <RarityBadge tier={pool.rarest_tier} /> : null}
          </span>
          {renderRewardSummary(pool)}
          <span className={styles.muted}>Used by: {promosLabel(pool)}</span>
        </span>
        {renderPoolActions(pool)}
      </>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the reward pools panel.
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
        <p className={styles.copy}>Loading reward pools...</p>
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
          <h1 className={styles.title}>Reward Pools</h1>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => openBuilder(null)}
          >
            Add New Reward Pool
          </button>
        </div>
        <p className={styles.copy}>
          A reward pool is a named group of rewards a spin wheel can land on.
          Each coupon spin wheel promo draws from one pool - for example a
          monthly-login promo could spin a pool of only rare rewards.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <FilterSortBar
          filterFields={POOL_FILTER_FIELDS}
          filterTiles={filterTiles}
          onAddFilter={handleAddFilter}
          onChangeFilter={handleChangeFilter}
          onRemoveFilter={handleRemoveFilter}
          sortFields={POOL_SORT_FIELDS}
          sortTile={sortTile}
          onChangeSort={setSortTile}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search reward pools..."
        >
          <div className={styles.viewControls}>
            <ViewSwitcher
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Reward pools view"
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
                  {POOL_GROUP_BY_AXES.map((axis) => (
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
            columns={poolColumns}
            rows={visiblePools}
            getRowKey={(pool) => pool.id}
            renderRowActions={renderPoolActions}
            emptyMessage="No reward pools match this filter."
          />
        ) : view === 'list' ? (
          <DataList
            items={visiblePools}
            getRowKey={(pool) => pool.id}
            renderItem={(pool) => (
              <div className={styles.poolRow}>{renderPoolCard(pool)}</div>
            )}
            emptyMessage="No reward pools match this filter."
          />
        ) : (
          <DataBoard
            groups={groupedPools}
            getRowKey={(pool) => pool.id}
            renderCard={(pool) => (
              <div className={styles.poolCard}>{renderPoolCard(pool)}</div>
            )}
            emptyColumnMessage="No reward pools here."
          />
        )}
      </div>

      {isBuilderOpen ? (
        <RewardPoolBuilderModal
          key={builderKey}
          isOpen={isBuilderOpen}
          pool={editingPool}
          rewards={rewards}
          isSaving={isSaving}
          error={saveError}
          onClose={closeBuilder}
          onSave={(values) => void handleSave(values)}
        />
      ) : null}
    </main>
  );
}
