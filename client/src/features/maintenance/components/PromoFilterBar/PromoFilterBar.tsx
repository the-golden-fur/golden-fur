import type { BranchSummary } from '../../maintenance.types';
import type { PromoTiming } from '../../utils/promoTiming';
import styles from './PromoFilterBar.module.css';

export type PromoTimingFilter = 'All' | PromoTiming;
export type PromoStatusFilter = 'All' | 'Active' | 'Inactive';

const TIMING_FILTERS: PromoTiming[] = ['Upcoming', 'Active', 'Ended'];

const TIMING_FILTER_LABELS: Record<PromoTiming, string> = {
  Upcoming: 'Upcoming',
  Active: 'Active now',
  Ended: 'Ended',
};

interface PromoFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  branches: BranchSummary[];
  branchFilter: string;
  onBranchFilterChange: (value: string) => void;
  timingFilter: PromoTimingFilter;
  onTimingFilterChange: (value: PromoTimingFilter) => void;
  statusFilter: PromoStatusFilter;
  onStatusFilterChange: (value: PromoStatusFilter) => void;
}

/**
 * Search + branch/timing/status filter controls above the promo card grid,
 * matching the Discount Management overhaul's DiscountFilterBar. Timing
 * (Upcoming/Active now/Ended) is a promo-specific filter - discounts have
 * no date window to classify.
 *
 * Custom change (unify active/available): "Branch scope" (the old
 * makati/southwoods/both enum) is now a real branch filter, same shape as
 * DiscountFilterBar's own "Branch" dropdown - a promo can be available at
 * any subset of branches, not just those three fixed combinations.
 */
export function PromoFilterBar({
  search,
  onSearchChange,
  branches,
  branchFilter,
  onBranchFilterChange,
  timingFilter,
  onTimingFilterChange,
  statusFilter,
  onStatusFilterChange,
}: PromoFilterBarProps) {
  return (
    <div className={styles.filters}>
      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Search</span>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by name..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Branch</span>
        <select
          className={styles.filterSelect}
          value={branchFilter}
          onChange={(event) => onBranchFilterChange(event.target.value)}
        >
          <option value="All">All branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Timing</span>
        <select
          className={styles.filterSelect}
          value={timingFilter}
          onChange={(event) =>
            onTimingFilterChange(event.target.value as PromoTimingFilter)
          }
        >
          <option value="All">All</option>
          {TIMING_FILTERS.map((timing) => (
            <option key={timing} value={timing}>
              {TIMING_FILTER_LABELS[timing]}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Status</span>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(event) =>
            onStatusFilterChange(event.target.value as PromoStatusFilter)
          }
        >
          <option value="All">All</option>
          <option value="Active">Active only</option>
          <option value="Inactive">Inactive only</option>
        </select>
      </label>
    </div>
  );
}
