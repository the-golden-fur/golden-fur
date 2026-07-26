import type { BranchSummary } from '../../../maintenance/maintenance.types';
import type { DiscountScopeType } from '../../discounts.types';
import styles from './DiscountFilterBar.module.css';

export type DiscountScopeTypeFilter = 'All' | DiscountScopeType;
export type DiscountStatusFilter = 'All' | 'Active' | 'Inactive';

interface DiscountFilterBarProps {
  branches: BranchSummary[];
  branchFilter: string;
  onBranchFilterChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  scopeTypeFilter: DiscountScopeTypeFilter;
  onScopeTypeFilterChange: (value: DiscountScopeTypeFilter) => void;
  statusFilter: DiscountStatusFilter;
  onStatusFilterChange: (value: DiscountStatusFilter) => void;
}

/**
 * Search + scope-type/status filter controls above the discount card grid
 * (#85 AC-2/AC-3), alongside the existing branch filter.
 */
export function DiscountFilterBar({
  branches,
  branchFilter,
  onBranchFilterChange,
  search,
  onSearchChange,
  scopeTypeFilter,
  onScopeTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
}: DiscountFilterBarProps) {
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
        <span className={styles.filterLabel}>Scope type</span>
        <select
          className={styles.filterSelect}
          value={scopeTypeFilter}
          onChange={(event) =>
            onScopeTypeFilterChange(
              event.target.value as DiscountScopeTypeFilter
            )
          }
        >
          <option value="All">All scopes</option>
          <option value="service">Service</option>
          <option value="package">Package</option>
          <option value="category">Category</option>
        </select>
      </label>

      <label className={styles.filterField}>
        <span className={styles.filterLabel}>Status</span>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(event) =>
            onStatusFilterChange(event.target.value as DiscountStatusFilter)
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
