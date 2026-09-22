import {
  dateRangePresetLabel,
  resolveDateRangePreset,
  type DateRangeBounds,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import type {
  DateRangeValue,
  FilterField,
  FilterTile,
  SortFieldDescriptor,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { BookingStatus } from '../../../booking/booking.types';

// Booking-status revision: the queue only ever shows Pending/In
// Progress/Completed rows (see VeterinaryConsolePage's STATUS_GROUPS) -
// Cancelled/No-show consultations are filtered out server-side already.
export const CONSULTATION_STATUS_GROUPS: BookingStatus[] = [
  'Pending',
  'In Progress',
  'Completed',
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

export const DATE_FILTER_FIELD: FilterField = {
  id: 'date',
  label: 'Date',
  type: 'date-range',
  // Pre-seeded as an already-added tile (see initial filterTiles state) so
  // the page keeps defaulting to Today, not "every date ever booked" -
  // removing the tile is then a real, deliberate "show every date" choice.
  defaultValue: { preset: 'today', from: null, to: null },
  formatValue: formatDateRange,
};

export const STATUS_FILTER_FIELD: FilterField = {
  id: 'status',
  label: 'Status',
  type: 'select',
  defaultValue: CONSULTATION_STATUS_GROUPS[0],
  options: CONSULTATION_STATUS_GROUPS.map((status) => ({
    value: status,
    label: status,
  })),
  formatValue: (value) => String(value ?? 'Any'),
};

export const CONSULTATION_QUEUE_FILTER_FIELDS: FilterField[] = [
  DATE_FILTER_FIELD,
  STATUS_FILTER_FIELD,
];

export const CONSULTATION_QUEUE_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'time',
    label: 'Scheduled time',
    directions: [{ value: 'earliest', label: 'Earliest first' }],
  },
  {
    id: 'pet-name',
    label: 'Pet name',
    directions: [{ value: 'az', label: 'A to Z' }],
  },
];

/** The date range that actually drives the server query - resolved from
 * the 'date' tile if present, unbounded (every date) if the viewer removed
 * it. */
export function deriveDateRange(tiles: FilterTile[]): DateRangeBounds {
  const tile = tiles.find((entry) => entry.fieldId === 'date');
  if (!tile || !tile.value || typeof tile.value !== 'object') {
    return { from: null, to: null };
  }
  const range = tile.value as DateRangeValue;
  return range.preset === 'custom'
    ? { from: range.from, to: range.to }
    : resolveDateRangePreset(range.preset);
}

/** The client-side status filter - 'All' when no 'status' tile is present. */
export function deriveStatusFilter(tiles: FilterTile[]): BookingStatus | 'All' {
  const tile = tiles.find((entry) => entry.fieldId === 'status');
  return tile && typeof tile.value === 'string'
    ? (tile.value as BookingStatus)
    : 'All';
}
