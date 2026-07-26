import type { PromoBranchScope } from '../../maintenance.types';
import type { PromoTiming } from '../../utils/promoTiming';
import styles from './PromoFilterBar.module.css';

export type PromoBranchScopeFilter = 'All' | PromoBranchScope;
export type PromoTimingFilter = 'All' | PromoTiming;
export type PromoStatusFilter = 'All' | 'Active' | 'Inactive';

const BRANCH_SCOPES: PromoBranchScope[] = ['makati', 'southwoods', 'both'];

const BRANCH_SCOPE_LABELS: Record<PromoBranchScope, string> = {
  makati: 'Makati',
  southwoods: 'Southwoods',
  both: 'Both branches',
};

const TIMING_FILTERS: PromoTiming[] = ['Upcoming', 'Active', 'Ended'];

const TIMING_FILTER_LABELS: Record<PromoTiming, string> = {
  Upcoming: 'Upcoming',
  Active: 'Active now',
  Ended: 'Ended',
};

interface PromoFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  branchScopeFilter: PromoBranchScopeFilter;
  onBranchScopeFilterChange: (value: PromoBranchScopeFilter) => void;
  timingFilter: PromoTimingFilter;
  onTimingFilterChange: (value: PromoTimingFilter) => void;
  statusFilter: PromoStatusFilter;
  onStatusFilterChange: (value: PromoStatusFilter) => void;
}

/**
 * Search + branch-scope/timing/status filter controls above the promo card
 * grid, matching the Discount Management overhaul's DiscountFilterBar.
 * Timing (Upcoming/Active now/Ended) is a promo-specific filter - discounts
 * have no date window to classify.
 */
export function PromoFilterBar({
  search,
  onSearchChange,
  branchScopeFilter,
  onBranchScopeFilterChange,
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
        <span className={styles.filterLabel}>Branch scope</span>
        <select
          className={styles.filterSelect}
          value={branchScopeFilter}
          onChange={(event) =>
            onBranchScopeFilterChange(
              event.target.value as PromoBranchScopeFilter
            )
          }
        >
          <option value="All">All</option>
          {BRANCH_SCOPES.map((scope) => (
            <option key={scope} value={scope}>
              {BRANCH_SCOPE_LABELS[scope]}
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
