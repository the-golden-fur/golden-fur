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
import { deriveBookingConfirmationState } from '../../bookingConfirmation';
import {
  BOOKING_CONFIRMATION_STATES,
  PAYMENT_STATUSES,
  SERVICE_CATEGORIES,
  type Booking,
  type PaymentStatus,
} from '../../booking.types';

/**
 * Names the page resolves from other fetches (pets, branches) - a booking
 * only carries `pet_id`/`branch_id`, so every helper that needs a readable
 * name takes this instead of re-deriving it.
 */
export interface BookingLookups {
  petNameById: Map<string, string>;
  branchNameById: Map<string, string>;
}

const NO_PET = 'Pet';
const NO_BRANCH = 'Branch';

export function petNameOf(booking: Booking, lookups: BookingLookups): string {
  return lookups.petNameById.get(booking.pet_id) ?? NO_PET;
}

export function branchNameOf(
  booking: Booking,
  lookups: BookingLookups
): string {
  return lookups.branchNameById.get(booking.branch_id) ?? NO_BRANCH;
}

/** Friendlier than the raw enum for a customer - "Pending" reads as "did I
 * do something wrong" rather than "not paid yet". */
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  Pending: 'Not paid yet',
  'Partially Paid': 'Partially paid',
  'Fully Paid': 'Fully paid',
};

export function paymentLabel(status: PaymentStatus): string {
  return PAYMENT_LABELS[status] ?? status;
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

export function buildBookingFilterFields(
  bookings: Booking[],
  lookups: BookingLookups
): FilterField[] {
  const petNames = distinctSorted(
    bookings.map((booking) => petNameOf(booking, lookups))
  );
  const branchNames = distinctSorted(
    bookings.map((booking) => branchNameOf(booking, lookups))
  );

  const statusField: FilterField = {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'Confirmed',
    options: BOOKING_CONFIRMATION_STATES.map((state) => ({
      value: state,
      label: state,
    })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  };

  const serviceField: FilterField = {
    id: 'service',
    label: 'Service',
    type: 'select',
    defaultValue: SERVICE_CATEGORIES[0],
    options: SERVICE_CATEGORIES.map((category) => ({
      value: category,
      label: category,
    })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  };

  const branchField: FilterField = {
    id: 'branch',
    label: 'Branch',
    type: 'select',
    defaultValue: branchNames[0] ?? '',
    options: branchNames.map((name) => ({ value: name, label: name })),
    formatValue: (value) =>
      typeof value === 'string' && value ? value : 'Any',
  };

  const petField: FilterField = {
    id: 'pet',
    label: 'Pet',
    type: 'select',
    defaultValue: petNames[0] ?? '',
    options: petNames.map((name) => ({ value: name, label: name })),
    formatValue: (value) =>
      typeof value === 'string' && value ? value : 'Any',
  };

  const paymentField: FilterField = {
    id: 'payment',
    label: 'Payment',
    type: 'select',
    defaultValue: PAYMENT_STATUSES[0],
    options: PAYMENT_STATUSES.map((status) => ({
      value: status,
      label: paymentLabel(status),
    })),
    formatValue: (value) =>
      typeof value === 'string' ? paymentLabel(value as PaymentStatus) : 'Any',
  };

  const dateField: FilterField = {
    id: 'date',
    label: 'Appointment date',
    type: 'date-range',
    // Starts unrestricted - adding the tile must not silently hide bookings;
    // the customer narrows it from the tile's popover.
    defaultValue: { preset: 'all', from: null, to: null },
    formatValue: formatDateRange,
  };

  return [
    statusField,
    serviceField,
    branchField,
    petField,
    paymentField,
    dateField,
  ];
}

export type BookingSortKey =
  | 'date-asc'
  | 'date-desc'
  | 'price-asc'
  | 'price-desc'
  | 'created-asc'
  | 'created-desc'
  | 'status-asc'
  | 'status-desc';

export const BOOKING_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'date',
    label: 'Appointment date',
    directions: [
      { value: 'asc', label: 'Soonest first' },
      { value: 'desc', label: 'Latest first' },
    ],
  },
  {
    id: 'created',
    label: 'Booked on',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
  {
    id: 'price',
    label: 'Total price',
    directions: [
      { value: 'asc', label: 'Low to high' },
      { value: 'desc', label: 'High to low' },
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
];

function timeOf(iso: string): number {
  return new Date(iso).getTime();
}

function statusOf(booking: Booking): string {
  return deriveBookingConfirmationState(booking);
}

function directed(
  compare: (a: Booking, b: Booking) => number,
  direction: 'asc' | 'desc'
): (a: Booking, b: Booking) => number {
  return direction === 'asc' ? compare : (a, b) => compare(b, a);
}

const BY_DATE = (a: Booking, b: Booking) =>
  timeOf(a.scheduled_start) - timeOf(b.scheduled_start);
const BY_CREATED = (a: Booking, b: Booking) =>
  timeOf(a.created_at) - timeOf(b.created_at);
const BY_PRICE = (a: Booking, b: Booking) =>
  Number(a.total_price) - Number(b.total_price);
const BY_STATUS = (a: Booking, b: Booking) =>
  statusOf(a).localeCompare(statusOf(b));

export const BOOKING_COMPARATORS: Record<
  BookingSortKey,
  (a: Booking, b: Booking) => number
> = {
  'date-asc': directed(BY_DATE, 'asc'),
  'date-desc': directed(BY_DATE, 'desc'),
  'created-asc': directed(BY_CREATED, 'asc'),
  'created-desc': directed(BY_CREATED, 'desc'),
  'price-asc': directed(BY_PRICE, 'asc'),
  'price-desc': directed(BY_PRICE, 'desc'),
  'status-asc': directed(BY_STATUS, 'asc'),
  'status-desc': directed(BY_STATUS, 'desc'),
};

/** Null when no sort tile is set - the page then keeps the order the server
 * returned bookings in rather than silently imposing a default sort. */
export function deriveBookingSortKey(
  sortTile: SortTile | null
): BookingSortKey | null {
  if (!sortTile) return null;

  const key = `${sortTile.fieldId}-${sortTile.direction}` as BookingSortKey;
  return key in BOOKING_COMPARATORS ? key : null;
}

export function matchesBookingQuery(
  booking: Booking,
  query: string,
  lookups: BookingLookups
): boolean {
  return [
    petNameOf(booking, lookups),
    branchNameOf(booking, lookups),
    booking.service_category,
    statusOf(booking),
    booking.status,
    paymentLabel(booking.payment_status),
  ].some((text) => text.toLowerCase().includes(query));
}

function inDateRange(booking: Booking, value: DateRangeValue): boolean {
  const bounds =
    value.preset === 'custom'
      ? { from: value.from, to: value.to }
      : resolveDateRangePreset(value.preset);
  const day = booking.scheduled_start.slice(0, 10);

  if (bounds.from && day < bounds.from) return false;
  if (bounds.to && day > bounds.to) return false;
  return true;
}

/** Every filter tile here is client-side only - `listBookings` already
 * returns just the signed-in customer's own bookings, a short list. */
export function applyBookingFilters(
  bookings: Booking[],
  tiles: FilterTile[],
  lookups: BookingLookups
): Booking[] {
  let result = bookings;

  for (const tile of tiles) {
    const { value } = tile;

    if (tile.fieldId === 'status' && typeof value === 'string' && value) {
      result = result.filter((booking) => statusOf(booking) === value);
    }

    if (tile.fieldId === 'service' && typeof value === 'string' && value) {
      result = result.filter((booking) => booking.service_category === value);
    }

    if (tile.fieldId === 'branch' && typeof value === 'string' && value) {
      result = result.filter(
        (booking) => branchNameOf(booking, lookups) === value
      );
    }

    if (tile.fieldId === 'pet' && typeof value === 'string' && value) {
      result = result.filter(
        (booking) => petNameOf(booking, lookups) === value
      );
    }

    if (tile.fieldId === 'payment' && typeof value === 'string' && value) {
      result = result.filter((booking) => booking.payment_status === value);
    }

    if (tile.fieldId === 'date' && value && typeof value === 'object') {
      const range = value as DateRangeValue;
      result = result.filter((booking) => inDateRange(booking, range));
    }
  }

  return result;
}

const MONTH_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
};

function monthOf(booking: Booking): string {
  return new Date(booking.scheduled_start).toLocaleDateString(
    undefined,
    MONTH_FORMAT
  );
}

/** Columns come from what's actually present (plus, for status, every
 * possible state so the board always shows the full lifecycle) - group order
 * for month is chronological, not alphabetical. */
export function buildBookingGroupByAxes(
  bookings: Booking[],
  lookups: BookingLookups
): GroupByAxis<Booking>[] {
  const monthsInOrder = Array.from(
    new Set([...bookings].sort(BY_DATE).map((booking) => monthOf(booking)))
  );

  return [
    {
      id: 'status',
      label: 'Status',
      columns: [...BOOKING_CONFIRMATION_STATES],
      columnFor: statusOf,
    },
    {
      id: 'service',
      label: 'Service',
      columns: [...SERVICE_CATEGORIES],
      columnFor: (booking) => booking.service_category,
    },
    {
      id: 'branch',
      label: 'Branch',
      columns: distinctSorted(
        bookings.map((booking) => branchNameOf(booking, lookups))
      ),
      columnFor: (booking) => branchNameOf(booking, lookups),
    },
    {
      id: 'pet',
      label: 'Pet',
      columns: distinctSorted(
        bookings.map((booking) => petNameOf(booking, lookups))
      ),
      columnFor: (booking) => petNameOf(booking, lookups),
    },
    {
      id: 'month',
      label: 'Month',
      columns: monthsInOrder,
      columnFor: monthOf,
    },
  ];
}

/** Local-calendar 'YYYY-MM-DD' key DataCalendar buckets a booking under -
 * local (not UTC) so an evening appointment lands on the day the customer
 * actually sees on their own clock. */
export function bookingCalendarDateKey(booking: Booking): string {
  const date = new Date(booking.scheduled_start);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}
