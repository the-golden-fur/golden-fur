import {
  dateRangePresetLabel,
  resolveDateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type {
  DateRangeValue,
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { ListActivityLogFilters } from '../../api/hotel.api';
import type { ActivityLogAction, ActivityLogEntry } from '../../hotel.types';

const ACTION_OPTIONS: Array<{ value: ActivityLogAction; label: string }> = [
  { value: 'check_in', label: 'Check-in' },
  { value: 'check_out', label: 'Check-out' },
  { value: 'task_started', label: 'Task started' },
  { value: 'task_completed', label: 'Task completed' },
  { value: 'task_reopened', label: 'Task reopened' },
  { value: 'task_missed', label: 'Task missed' },
];

function formatDateRange(value: unknown): string {
  if (!value || typeof value !== 'object') return 'All dates';
  const range = value as DateRangeValue;
  if (range.preset === 'custom') {
    if (!range.from && !range.to) return 'All dates';
    return `${range.from ?? '…'} → ${range.to ?? '…'}`;
  }
  return dateRangePresetLabel(range.preset);
}

export const ACTIVITY_LOG_FILTER_FIELDS: FilterField[] = [
  {
    id: 'action',
    label: 'Action',
    type: 'select',
    defaultValue: ACTION_OPTIONS[0].value,
    options: ACTION_OPTIONS,
    formatValue: (value) =>
      ACTION_OPTIONS.find((option) => option.value === value)?.label ?? 'Any',
  },
  {
    id: 'date',
    label: 'Date',
    type: 'date-range',
    // Matches the page's old always-on "Today" default - now a removable
    // pill instead of a fixed control (clearing it shows the most recent
    // 200 entries branch-wide, server-side default with no date bound).
    defaultValue: { preset: 'today', from: null, to: null },
    formatValue: formatDateRange,
  },
];

export const ACTIVITY_LOG_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'date',
    label: 'Date',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
];

export type ActivityLogSortKey = 'date-desc' | 'date-asc';

export const ACTIVITY_LOG_COMPARATORS: Record<
  ActivityLogSortKey,
  (a: ActivityLogEntry, b: ActivityLogEntry) => number
> = {
  'date-desc': (a, b) => b.created_at.localeCompare(a.created_at),
  'date-asc': (a, b) => a.created_at.localeCompare(b.created_at),
};

export function deriveActivityLogSortKey(
  sortTile: SortTile | null
): ActivityLogSortKey {
  if (!sortTile) return 'date-desc';
  return sortTile.direction === 'asc' ? 'date-asc' : 'date-desc';
}

export function matchesActivityLogQuery(
  entry: ActivityLogEntry,
  query: string
): boolean {
  return (
    entry.description.toLowerCase().includes(query) ||
    (entry.actor_staff?.display_name ?? '').toLowerCase().includes(query)
  );
}

/** The Action tile is entirely client-side (matches the page's old
 * behavior); the Date tile maps onto the endpoint's existing dateFrom/dateTo
 * params, the one server-backed piece here. */
export function applyActivityLogFilters(
  entries: ActivityLogEntry[],
  tiles: FilterTile[]
): ActivityLogEntry[] {
  let result = entries;

  for (const tile of tiles) {
    if (tile.fieldId === 'action' && typeof tile.value === 'string') {
      result = result.filter((entry) => entry.action === tile.value);
    }
  }

  return result;
}

export function deriveActivityLogServerParams(
  tiles: FilterTile[]
): Pick<ListActivityLogFilters, 'dateFrom' | 'dateTo'> {
  const dateTile = tiles.find((tile) => tile.fieldId === 'date');
  if (!dateTile || typeof dateTile.value !== 'object' || !dateTile.value) {
    return {};
  }

  const range = dateTile.value as DateRangeValue;
  const bounds =
    range.preset === 'custom'
      ? { from: range.from, to: range.to }
      : resolveDateRangePreset(range.preset);

  const params: Pick<ListActivityLogFilters, 'dateFrom' | 'dateTo'> = {};
  if (bounds.from) params.dateFrom = bounds.from;
  if (bounds.to) params.dateTo = bounds.to;
  return params;
}

/** Local (not UTC) calendar day, matching how each entry's time is already
 * displayed elsewhere on this page (toLocaleString, no explicit timezone). */
export function activityLogDateKey(entry: ActivityLogEntry): string {
  const date = new Date(entry.created_at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
