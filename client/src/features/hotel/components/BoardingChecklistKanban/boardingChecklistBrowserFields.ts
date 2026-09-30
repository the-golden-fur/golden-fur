import {
  dateRangePresetLabel,
  resolveDateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type {
  DateRangeValue,
  FilterField,
  FilterOption,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { CareLogEntriesFilters } from '../../api/hotel.api';
import type {
  CareLogEntry,
  CareLogEntryStatus,
  MealTime,
} from '../../hotel.types';

export type CareType = CareLogEntry['care_type'];

/** One checklist task plus the pet name the board resolves separately (an
 * entry only carries `stays.pet_id`). */
export interface Row {
  entry: CareLogEntry;
  petName: string;
}

export const STATUS_COLUMNS: CareLogEntryStatus[] = [
  'Backlog',
  'Pending',
  'In Progress',
  'Completed',
  'Missed',
];

export const TIME_BLOCK_ORDER: MealTime[] = [
  'Morning',
  'Noon',
  'Afternoon',
  'Evening',
];

export const UNSCHEDULED = 'Unscheduled';

const TIME_COLUMNS: string[] = [...TIME_BLOCK_ORDER, UNSCHEDULED];

export const CATEGORY_COLUMNS: CareType[] = [
  'Feeding',
  'Walking',
  'Playing',
  'Medication',
];

/** GET /hotel/care-log/today treats "no bounds at all" as today only (its
 * original default), so a genuinely unbounded range - the "All dates"
 * preset, a removed Date tile, or one booking's whole stay - has to send an
 * explicit lower bound instead. Nothing in this system predates it. */
export const ALL_DATES_FROM = '2000-01-01';

export const DEFAULT_DATE_TILE: FilterTile = {
  fieldId: 'date',
  value: { preset: 'today', from: null, to: null },
};

function toOptions(values: readonly string[]): FilterOption[] {
  return values.map((value) => ({ value, label: value }));
}

function formatDateRange(value: unknown): string {
  if (!value || typeof value !== 'object') return 'All dates';
  const range = value as DateRangeValue;
  if (range.preset === 'custom') {
    if (!range.from && !range.to) return 'All dates';
    return `${range.from ?? '…'} → ${range.to ?? '…'}`;
  }
  return dateRangePresetLabel(range.preset);
}

function formatMulti(value: unknown): string {
  return Array.isArray(value) && value.length > 0 ? value.join(', ') : 'Any';
}

export function timeBlockOf(entry: CareLogEntry): string {
  return entry.time_block ?? UNSCHEDULED;
}

export function buildChecklistFilterFields(rows: Row[]): FilterField[] {
  const petNames = Array.from(new Set(rows.map((row) => row.petName))).sort(
    (a, b) => a.localeCompare(b)
  );

  return [
    {
      id: 'date',
      label: 'Date',
      type: 'date-range',
      defaultValue: DEFAULT_DATE_TILE.value,
      formatValue: formatDateRange,
    },
    {
      id: 'status',
      label: 'Status',
      type: 'multi-select',
      defaultValue: [],
      options: toOptions(STATUS_COLUMNS),
      formatValue: formatMulti,
    },
    {
      id: 'category',
      label: 'Category',
      type: 'multi-select',
      defaultValue: [],
      options: toOptions(CATEGORY_COLUMNS),
      formatValue: formatMulti,
    },
    {
      id: 'time',
      label: 'Time of day',
      type: 'multi-select',
      defaultValue: [],
      options: toOptions(TIME_COLUMNS),
      formatValue: formatMulti,
    },
    {
      id: 'pet',
      label: 'Pet',
      type: 'select',
      defaultValue: petNames[0] ?? null,
      options: toOptions(petNames),
      formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
    },
  ];
}

export const CHECKLIST_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'scheduled',
    label: 'Scheduled',
    directions: [
      { value: 'asc', label: 'Soonest first' },
      { value: 'desc', label: 'Latest first' },
    ],
  },
  {
    id: 'pet',
    label: 'Pet name',
    directions: [
      { value: 'asc', label: 'A–Z' },
      { value: 'desc', label: 'Z–A' },
    ],
  },
  {
    id: 'status',
    label: 'Status',
    directions: [{ value: 'asc', label: 'Pipeline order' }],
  },
];

export type ChecklistSortKey =
  | 'scheduled-asc'
  | 'scheduled-desc'
  | 'pet-asc'
  | 'pet-desc'
  | 'status-asc';

function timeBlockIndex(timeBlock: MealTime | null): number {
  return timeBlock
    ? TIME_BLOCK_ORDER.indexOf(timeBlock)
    : TIME_BLOCK_ORDER.length;
}

function compareScheduled(a: Row, b: Row): number {
  const dateDiff = a.entry.scheduled_date.localeCompare(b.entry.scheduled_date);
  return dateDiff !== 0
    ? dateDiff
    : timeBlockIndex(a.entry.time_block) - timeBlockIndex(b.entry.time_block);
}

export const CHECKLIST_COMPARATORS: Record<
  ChecklistSortKey,
  (a: Row, b: Row) => number
> = {
  'scheduled-asc': compareScheduled,
  'scheduled-desc': (a, b) => compareScheduled(b, a),
  'pet-asc': (a, b) => a.petName.localeCompare(b.petName),
  'pet-desc': (a, b) => b.petName.localeCompare(a.petName),
  'status-asc': (a, b) =>
    STATUS_COLUMNS.indexOf(a.entry.status) -
      STATUS_COLUMNS.indexOf(b.entry.status) || compareScheduled(a, b),
};

/** No sort tile keeps the board's long-standing "soonest first" default. */
export function deriveChecklistSortKey(
  sortTile: SortTile | null
): ChecklistSortKey {
  if (!sortTile) return 'scheduled-asc';
  const key = `${sortTile.fieldId}-${sortTile.direction}`;
  return key in CHECKLIST_COMPARATORS
    ? (key as ChecklistSortKey)
    : 'scheduled-asc';
}

export function matchesChecklistQuery(row: Row, query: string): boolean {
  return (
    row.petName.toLowerCase().includes(query) ||
    row.entry.description.toLowerCase().includes(query)
  );
}

/** Every tile except Date is client-side; Date maps onto the endpoint's
 * date_from/date_to (see deriveChecklistServerParams). */
export function applyChecklistFilters(rows: Row[], tiles: FilterTile[]): Row[] {
  let result = rows;

  for (const tile of tiles) {
    const { value } = tile;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (tile.fieldId === 'status') {
        result = result.filter((row) => value.includes(row.entry.status));
      } else if (tile.fieldId === 'category') {
        result = result.filter((row) => value.includes(row.entry.care_type));
      } else if (tile.fieldId === 'time') {
        result = result.filter((row) => value.includes(timeBlockOf(row.entry)));
      }
    } else if (tile.fieldId === 'pet' && typeof value === 'string') {
      result = result.filter((row) => row.petName === value);
    }
  }

  return result;
}

export function deriveChecklistServerParams(
  tiles: FilterTile[]
): CareLogEntriesFilters {
  const dateTile = tiles.find((tile) => tile.fieldId === 'date');
  if (!dateTile || typeof dateTile.value !== 'object' || !dateTile.value) {
    return { dateFrom: ALL_DATES_FROM };
  }

  const range = dateTile.value as DateRangeValue;
  const bounds =
    range.preset === 'custom'
      ? { from: range.from, to: range.to }
      : resolveDateRangePreset(range.preset);

  const params: CareLogEntriesFilters = {
    dateFrom: bounds.from ?? ALL_DATES_FROM,
  };
  if (bounds.to) params.dateTo = bounds.to;
  return params;
}

export const CHECKLIST_GROUP_BY_AXES: GroupByAxis<Row>[] = [
  {
    id: 'status',
    label: 'Status',
    columns: STATUS_COLUMNS,
    columnFor: (row) => row.entry.status,
  },
  {
    id: 'time',
    label: 'Time of day',
    columns: TIME_COLUMNS,
    columnFor: (row) => timeBlockOf(row.entry),
  },
  {
    id: 'category',
    label: 'Instructions (category)',
    columns: CATEGORY_COLUMNS,
    columnFor: (row) => row.entry.care_type,
  },
];
