import type {
  DateRangeValue,
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import {
  dateRangePresetLabel,
  resolveDateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  UNAVAILABILITY_LEAVE_TYPES,
  type UnavailabilityBlockStatus,
  type UnavailabilityHistoryEntry,
} from '../../staff.types';

/** Every status, in lifecycle order - the board always shows all of them. */
export const DAY_OFF_STATUSES: UnavailabilityBlockStatus[] = [
  'pending',
  'approved',
  'denied',
  'cancelled',
];

const STATUS_LABELS: Record<UnavailabilityBlockStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

export function dayOffStatusLabel(status: UnavailabilityBlockStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const NO_REVIEWER = 'Not reviewed';
const FULL_DAY = 'Full day';
const PARTIAL_DAY = 'Part of a day';

export function reviewerOf(entry: UnavailabilityHistoryEntry): string {
  return entry.reviewer_name ?? NO_REVIEWER;
}

function durationOf(entry: UnavailabilityHistoryEntry): string {
  return entry.is_full_day ? FULL_DAY : PARTIAL_DAY;
}

function formatDateRange(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Any date';
  const range = value as DateRangeValue;
  if (range.preset === 'custom') {
    if (!range.from && !range.to) return 'Any date';
    return `${range.from ?? '…'} → ${range.to ?? '…'}`;
  }
  return dateRangePresetLabel(range.preset);
}

function distinctSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function selectFormat(value: unknown): string {
  return typeof value === 'string' && value ? value : 'Any';
}

export function buildDayOffFilterFields(
  entries: UnavailabilityHistoryEntry[]
): FilterField[] {
  const reviewers = distinctSorted(entries.map(reviewerOf));

  return [
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'pending',
      options: DAY_OFF_STATUSES.map((status) => ({
        value: status,
        label: dayOffStatusLabel(status),
      })),
      formatValue: (value) =>
        typeof value === 'string'
          ? dayOffStatusLabel(value as UnavailabilityBlockStatus)
          : 'Any',
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      defaultValue: UNAVAILABILITY_LEAVE_TYPES[1],
      options: UNAVAILABILITY_LEAVE_TYPES.map((type) => ({
        value: type,
        label: type,
      })),
      formatValue: selectFormat,
    },
    {
      id: 'reviewer',
      label: 'Reviewer',
      type: 'select',
      defaultValue: reviewers[0] ?? '',
      options: reviewers.map((name) => ({ value: name, label: name })),
      formatValue: selectFormat,
    },
    {
      id: 'duration',
      label: 'Duration',
      type: 'select',
      defaultValue: FULL_DAY,
      options: [FULL_DAY, PARTIAL_DAY].map((value) => ({
        value,
        label: value,
      })),
      formatValue: selectFormat,
    },
    {
      id: 'date',
      label: 'Day off date',
      type: 'date-range',
      // Starts unrestricted - adding the tile must not silently hide rows.
      defaultValue: { preset: 'all', from: null, to: null },
      formatValue: formatDateRange,
    },
  ];
}

export type DayOffSortKey =
  | 'date-asc'
  | 'date-desc'
  | 'requested-asc'
  | 'requested-desc'
  | 'status-asc'
  | 'status-desc'
  | 'type-asc'
  | 'type-desc';

export const DAY_OFF_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'date',
    label: 'Day off date',
    directions: [
      { value: 'asc', label: 'Soonest first' },
      { value: 'desc', label: 'Latest first' },
    ],
  },
  {
    id: 'requested',
    label: 'Requested on',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
  {
    id: 'status',
    label: 'Status',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
  {
    id: 'type',
    label: 'Type',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

type Comparator = (
  a: UnavailabilityHistoryEntry,
  b: UnavailabilityHistoryEntry
) => number;

function timeOf(iso: string): number {
  return new Date(iso).getTime();
}

function directed(compare: Comparator, direction: 'asc' | 'desc'): Comparator {
  return direction === 'asc' ? compare : (a, b) => compare(b, a);
}

const BY_DATE: Comparator = (a, b) =>
  timeOf(a.start_time) - timeOf(b.start_time);
const BY_REQUESTED: Comparator = (a, b) =>
  timeOf(a.created_at) - timeOf(b.created_at);
const BY_STATUS: Comparator = (a, b) =>
  dayOffStatusLabel(a.status).localeCompare(dayOffStatusLabel(b.status));
const BY_TYPE: Comparator = (a, b) => a.leave_type.localeCompare(b.leave_type);

export const DAY_OFF_COMPARATORS: Record<DayOffSortKey, Comparator> = {
  'date-asc': directed(BY_DATE, 'asc'),
  'date-desc': directed(BY_DATE, 'desc'),
  'requested-asc': directed(BY_REQUESTED, 'asc'),
  'requested-desc': directed(BY_REQUESTED, 'desc'),
  'status-asc': directed(BY_STATUS, 'asc'),
  'status-desc': directed(BY_STATUS, 'desc'),
  'type-asc': directed(BY_TYPE, 'asc'),
  'type-desc': directed(BY_TYPE, 'desc'),
};

/** Newest request first until the user picks a sort - a request they just
 * made lands at the top. */
export const DEFAULT_DAY_OFF_SORT_KEY: DayOffSortKey = 'requested-desc';

export function deriveDayOffSortKey(
  sortTile: SortTile | null
): DayOffSortKey | null {
  if (!sortTile) return null;

  const key = `${sortTile.fieldId}-${sortTile.direction}` as DayOffSortKey;
  return key in DAY_OFF_COMPARATORS ? key : null;
}

export function matchesDayOffQuery(
  entry: UnavailabilityHistoryEntry,
  query: string
): boolean {
  return [
    entry.reason ?? '',
    entry.leave_type,
    dayOffStatusLabel(entry.status),
    entry.reviewer_name ?? '',
    entry.requested_reviewer_name ?? '',
    entry.denial_reason ?? '',
  ].some((text) => text.toLowerCase().includes(query));
}

/** Local-calendar 'YYYY-MM-DD' of the day off's start - local, not UTC, so
 * it lands on the day the staff member sees on their own clock. */
export function dayOffCalendarDateKey(
  entry: UnavailabilityHistoryEntry
): string {
  const date = new Date(entry.start_time);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function inDateRange(
  entry: UnavailabilityHistoryEntry,
  value: DateRangeValue
): boolean {
  const bounds =
    value.preset === 'custom'
      ? { from: value.from, to: value.to }
      : resolveDateRangePreset(value.preset);
  const day = dayOffCalendarDateKey(entry);

  if (bounds.from && day < bounds.from) return false;
  if (bounds.to && day > bounds.to) return false;
  return true;
}

/** Client-side only - the history is one staff member's own rows. */
export function applyDayOffFilters(
  entries: UnavailabilityHistoryEntry[],
  tiles: FilterTile[]
): UnavailabilityHistoryEntry[] {
  let result = entries;

  for (const { fieldId, value } of tiles) {
    if (fieldId === 'date' && value && typeof value === 'object') {
      const range = value as DateRangeValue;
      result = result.filter((entry) => inDateRange(entry, range));
      continue;
    }

    if (typeof value !== 'string' || !value) continue;

    if (fieldId === 'status') {
      result = result.filter((entry) => entry.status === value);
    }
    if (fieldId === 'type') {
      result = result.filter((entry) => entry.leave_type === value);
    }
    if (fieldId === 'reviewer') {
      result = result.filter((entry) => reviewerOf(entry) === value);
    }
    if (fieldId === 'duration') {
      result = result.filter((entry) => durationOf(entry) === value);
    }
  }

  return result;
}

const MONTH_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
};

function monthOf(entry: UnavailabilityHistoryEntry): string {
  return new Date(entry.start_time).toLocaleDateString(undefined, MONTH_FORMAT);
}

export function buildDayOffGroupByAxes(
  entries: UnavailabilityHistoryEntry[]
): GroupByAxis<UnavailabilityHistoryEntry>[] {
  const monthsInOrder = Array.from(
    new Set([...entries].sort(BY_DATE).map(monthOf))
  );

  return [
    {
      id: 'status',
      label: 'Status',
      columns: DAY_OFF_STATUSES.map(dayOffStatusLabel),
      columnFor: (entry) => dayOffStatusLabel(entry.status),
    },
    {
      id: 'type',
      label: 'Type',
      columns: [...UNAVAILABILITY_LEAVE_TYPES],
      columnFor: (entry) => entry.leave_type,
    },
    {
      id: 'month',
      label: 'Month',
      columns: monthsInOrder,
      columnFor: monthOf,
    },
    {
      id: 'reviewer',
      label: 'Reviewer',
      columns: distinctSorted(entries.map(reviewerOf)),
      columnFor: reviewerOf,
    },
  ];
}
