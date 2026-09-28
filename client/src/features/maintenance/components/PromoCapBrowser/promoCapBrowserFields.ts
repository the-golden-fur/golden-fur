import type {
  FilterField,
  FilterTile,
  NumberRangeValue,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { CapType, PromoCapConfiguration } from '../../maintenance.types';

/** One row per branch: the branch plus its saved cap, if any. */
export interface CapRow {
  branchId: string;
  branchName: string;
  config?: PromoCapConfiguration;
}

export const CAP_TYPE_LABELS: Record<CapType, string> = {
  percentage: 'Percentage',
  flat: 'Flat',
  count: 'Number of promos',
};

export const CAP_VALUE_SUFFIX: Record<CapType, string> = {
  percentage: '%',
  flat: ' PHP',
  count: ' promo(s)',
};

const NO_CAP = 'none';
const NO_CAP_LABEL = 'No cap saved';

const CAP_TYPES: CapType[] = ['percentage', 'flat', 'count'];

/** Column key / filter value for a row: its cap type, or NO_CAP. */
function capKindOf(row: CapRow): string {
  return row.config ? row.config.cap_type : NO_CAP;
}

function kindLabel(kind: string): string {
  return kind === NO_CAP ? NO_CAP_LABEL : CAP_TYPE_LABELS[kind as CapType];
}

export function describeCap(config: PromoCapConfiguration): string {
  return `${CAP_TYPE_LABELS[config.cap_type]} - ${config.cap_value}${CAP_VALUE_SUFFIX[config.cap_type]}`;
}

export const CAP_FILTER_FIELDS: FilterField[] = [
  {
    id: 'capType',
    label: 'Cap type',
    type: 'select',
    defaultValue: CAP_TYPES[0],
    options: [
      ...CAP_TYPES.map((type) => ({
        value: type,
        label: CAP_TYPE_LABELS[type],
      })),
      { value: NO_CAP, label: NO_CAP_LABEL },
    ],
    formatValue: (value) =>
      typeof value === 'string' && value ? kindLabel(value) : 'Any',
  },
  {
    id: 'capValue',
    label: 'Cap value',
    type: 'number-range',
    defaultValue: { min: null, max: null },
    minLabel: 'Min value',
    maxLabel: 'Max value',
    formatValue: (value) => {
      const range = value as NumberRangeValue | null;
      if (!range || (range.min === null && range.max === null)) return 'Any';
      return `${range.min ?? '…'} to ${range.max ?? '…'}`;
    },
  },
];

export type CapSortKey =
  | 'branch-asc'
  | 'branch-desc'
  | 'value-asc'
  | 'value-desc'
  | 'type-asc'
  | 'type-desc';

export const CAP_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'branch',
    label: 'Branch',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'value',
    label: 'Cap value',
    directions: [
      { value: 'asc', label: 'Low to high' },
      { value: 'desc', label: 'High to low' },
    ],
  },
  {
    id: 'type',
    label: 'Cap type',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

const byBranch = (a: CapRow, b: CapRow) =>
  a.branchName.localeCompare(b.branchName);

/** Rows with no cap always sort last on value, in either direction, so the
 * branches that actually have one aren't buried. */
function byValue(direction: 'asc' | 'desc') {
  return (a: CapRow, b: CapRow) => {
    if (!a.config && !b.config) return byBranch(a, b);
    if (!a.config) return 1;
    if (!b.config) return -1;

    const diff = Number(a.config.cap_value) - Number(b.config.cap_value);
    return direction === 'asc' ? diff : -diff;
  };
}

export const CAP_COMPARATORS: Record<
  CapSortKey,
  (a: CapRow, b: CapRow) => number
> = {
  'branch-asc': byBranch,
  'branch-desc': (a, b) => byBranch(b, a),
  'value-asc': byValue('asc'),
  'value-desc': byValue('desc'),
  'type-asc': (a, b) =>
    kindLabel(capKindOf(a)).localeCompare(kindLabel(capKindOf(b))),
  'type-desc': (a, b) =>
    kindLabel(capKindOf(b)).localeCompare(kindLabel(capKindOf(a))),
};

/** No sort tile keeps the original A-to-Z branch order. */
export function deriveCapSortKey(sortTile: SortTile | null): CapSortKey {
  if (!sortTile) return 'branch-asc';

  const key = `${sortTile.fieldId}-${sortTile.direction}` as CapSortKey;
  return key in CAP_COMPARATORS ? key : 'branch-asc';
}

export function matchesCapQuery(row: CapRow, query: string): boolean {
  return (
    row.branchName.toLowerCase().includes(query) ||
    kindLabel(capKindOf(row)).toLowerCase().includes(query)
  );
}

export function applyCapFilters(rows: CapRow[], tiles: FilterTile[]): CapRow[] {
  let result = rows;

  for (const tile of tiles) {
    const { value } = tile;

    if (tile.fieldId === 'capType' && typeof value === 'string' && value) {
      result = result.filter((row) => capKindOf(row) === value);
    }

    if (tile.fieldId === 'capValue' && value && typeof value === 'object') {
      const range = value as NumberRangeValue;
      result = result.filter((row) => {
        // A branch with no cap has no value to compare - it never matches a
        // value range.
        if (!row.config) return range.min === null && range.max === null;

        const amount = Number(row.config.cap_value);
        if (range.min !== null && amount < range.min) return false;
        if (range.max !== null && amount > range.max) return false;
        return true;
      });
    }
  }

  return result;
}

export const CAP_GROUP_BY_AXES: GroupByAxis<CapRow>[] = [
  {
    id: 'capType',
    label: 'Cap type',
    columns: [...CAP_TYPES.map((type) => CAP_TYPE_LABELS[type]), NO_CAP_LABEL],
    columnFor: (row) => kindLabel(capKindOf(row)),
  },
];
