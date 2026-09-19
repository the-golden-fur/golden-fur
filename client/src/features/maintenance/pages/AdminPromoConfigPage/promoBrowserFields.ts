import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { getPromoTiming, type PromoTiming } from '../../utils/promoTiming';
import type { BranchSummary, Promo } from '../../maintenance.types';

const TIMING_OPTIONS: { value: PromoTiming; label: string }[] = [
  { value: 'Upcoming', label: 'Upcoming' },
  { value: 'Active', label: 'Active now' },
  { value: 'Ended', label: 'Ended' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function availableBranchIds(promo: Promo): string[] {
  return (promo.promo_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/** `branchOptions` comes from `listBranches` - same list the create/edit
 * form's branch multi-select and the Promo Cap section already use. */
export function buildPromoFilterFields(
  branchOptions: BranchSummary[]
): FilterField[] {
  const branchField: FilterField = {
    id: 'branch',
    label: 'Branch',
    type: 'select',
    defaultValue: branchOptions[0]?.id ?? '',
    options: branchOptions.map((branch) => ({
      value: branch.id,
      label: branch.name,
    })),
    formatValue: (value) =>
      branchOptions.find((branch) => branch.id === value)?.name ?? 'Any',
  };

  const timingField: FilterField = {
    id: 'timing',
    label: 'Timing',
    type: 'select',
    defaultValue: TIMING_OPTIONS[0].value,
    options: TIMING_OPTIONS,
    formatValue: (value) =>
      TIMING_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  };

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    // Original page defaulted its own statusFilter to 'Active' (not 'All')
    // - kept as the default here too, no tile means "show everything".
    defaultValue: 'active',
    options: STATUS_OPTIONS,
    formatValue: (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ??
      'Any',
  };

  return [branchField, timingField, statusField];
}

export type PromoSortKey = 'name-asc' | 'name-desc' | 'value-desc' | 'value-asc';

export const PROMO_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'value',
    label: 'Value',
    directions: [
      { value: 'desc', label: 'High to low' },
      { value: 'asc', label: 'Low to high' },
    ],
  },
];

export const PROMO_COMPARATORS: Record<
  PromoSortKey,
  (a: Promo, b: Promo) => number
> = {
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'value-desc': (a, b) => b.value - a.value,
  'value-asc': (a, b) => a.value - b.value,
};

export function derivePromoSortKey(sortTile: SortTile | null): PromoSortKey {
  if (!sortTile) return 'name-asc';
  if (sortTile.fieldId === 'value') {
    return sortTile.direction === 'asc' ? 'value-asc' : 'value-desc';
  }
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesPromoQuery(promo: Promo, query: string): boolean {
  return promo.name.toLowerCase().includes(query);
}

/** Every filter tile here is client-side only, reproducing the page's old
 * `filteredPromos` useMemo as a pure, independently-testable function. */
export function applyPromoFilters(promos: Promo[], tiles: FilterTile[]): Promo[] {
  let result = promos;

  for (const tile of tiles) {
    if (tile.fieldId === 'branch' && typeof tile.value === 'string' && tile.value) {
      const branchId = tile.value;
      result = result.filter((promo) =>
        availableBranchIds(promo).includes(branchId)
      );
    }

    if (tile.fieldId === 'timing' && typeof tile.value === 'string' && tile.value) {
      result = result.filter(
        (promo) => getPromoTiming(promo) === tile.value
      );
    }

    if (tile.fieldId === 'status' && typeof tile.value === 'string') {
      const wantActive = tile.value === 'active';
      result = result.filter((promo) => promo.is_active === wantActive);
    }
  }

  return result;
}
