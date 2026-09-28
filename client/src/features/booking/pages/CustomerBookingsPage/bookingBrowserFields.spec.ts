import { describe, expect, it } from 'vitest';
import type { Booking } from '../../booking.types';
import {
  applyBookingFilters,
  BOOKING_COMPARATORS,
  bookingCalendarDateKey,
  buildBookingFilterFields,
  buildBookingGroupByAxes,
  deriveBookingSortKey,
  matchesBookingQuery,
  paymentLabel,
  type BookingLookups,
} from './bookingBrowserFields';

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Grooming',
    service_id: 'service-1',
    package_id: null,
    scheduled_start: '2026-08-03T01:00:00.000Z',
    scheduled_end: '2026-08-03T02:00:00.000Z',
    assigned_staff_id: null,
    status: 'Pending',
    total_price: 500,
    downpayment_amount: null,
    payment_status: 'Pending',
    payment_method: 'Cash',
    payment_confirmed: false,
    special_instructions: null,
    hotel_preferences: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reschedule_count: 0,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  } as Booking;
}

const LOOKUPS: BookingLookups = {
  petNameById: new Map([
    ['pet-1', 'Biscuit'],
    ['pet-2', 'Mochi'],
  ]),
  branchNameById: new Map([
    ['branch-1', 'Makati'],
    ['branch-2', 'Southwoods'],
  ]),
};

const GROOMING = buildBooking({
  id: 'a',
  pet_id: 'pet-1',
  branch_id: 'branch-1',
  service_category: 'Grooming',
  scheduled_start: '2026-08-03T01:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  total_price: 300,
  payment_status: 'Fully Paid',
});
const HOTEL = buildBooking({
  id: 'b',
  pet_id: 'pet-2',
  branch_id: 'branch-2',
  service_category: 'Hotel',
  scheduled_start: '2026-09-10T01:00:00.000Z',
  created_at: '2026-07-20T00:00:00.000Z',
  total_price: 900,
  status: 'Cancelled',
  payment_status: 'Pending',
});
const BOOKINGS = [GROOMING, HOTEL];

describe('matchesBookingQuery', () => {
  it('matches on pet, branch, service, and status text, case-insensitively', () => {
    expect(matchesBookingQuery(GROOMING, 'biscuit', LOOKUPS)).toBe(true);
    expect(matchesBookingQuery(GROOMING, 'makati', LOOKUPS)).toBe(true);
    expect(matchesBookingQuery(GROOMING, 'groom', LOOKUPS)).toBe(true);
    expect(matchesBookingQuery(HOTEL, 'cancel', LOOKUPS)).toBe(true);
    expect(matchesBookingQuery(HOTEL, 'biscuit', LOOKUPS)).toBe(false);
  });
});

describe('applyBookingFilters', () => {
  it('filters by derived status', () => {
    const result = applyBookingFilters(
      BOOKINGS,
      [{ fieldId: 'status', value: 'Cancelled' }],
      LOOKUPS
    );

    expect(result).toEqual([HOTEL]);
  });

  it('filters by service, branch, pet, and payment status', () => {
    expect(
      applyBookingFilters(
        BOOKINGS,
        [{ fieldId: 'service', value: 'Hotel' }],
        LOOKUPS
      )
    ).toEqual([HOTEL]);
    expect(
      applyBookingFilters(
        BOOKINGS,
        [{ fieldId: 'branch', value: 'Makati' }],
        LOOKUPS
      )
    ).toEqual([GROOMING]);
    expect(
      applyBookingFilters(
        BOOKINGS,
        [{ fieldId: 'pet', value: 'Mochi' }],
        LOOKUPS
      )
    ).toEqual([HOTEL]);
    expect(
      applyBookingFilters(
        BOOKINGS,
        [{ fieldId: 'payment', value: 'Fully Paid' }],
        LOOKUPS
      )
    ).toEqual([GROOMING]);
  });

  it('filters by a custom appointment date range, open-ended on either side', () => {
    expect(
      applyBookingFilters(
        BOOKINGS,
        [
          {
            fieldId: 'date',
            value: { preset: 'custom', from: '2026-09-01', to: null },
          },
        ],
        LOOKUPS
      )
    ).toEqual([HOTEL]);
    expect(
      applyBookingFilters(
        BOOKINGS,
        [
          {
            fieldId: 'date',
            value: { preset: 'custom', from: null, to: '2026-08-31' },
          },
        ],
        LOOKUPS
      )
    ).toEqual([GROOMING]);
  });

  it('an unrestricted ("all dates") tile keeps everything, and tiles combine with AND', () => {
    expect(
      applyBookingFilters(
        BOOKINGS,
        [{ fieldId: 'date', value: { preset: 'all', from: null, to: null } }],
        LOOKUPS
      )
    ).toEqual(BOOKINGS);
    expect(
      applyBookingFilters(
        BOOKINGS,
        [
          { fieldId: 'service', value: 'Hotel' },
          { fieldId: 'payment', value: 'Fully Paid' },
        ],
        LOOKUPS
      )
    ).toEqual([]);
  });
});

describe('sorting', () => {
  it('derives a comparator key from a sort tile, and null when there is no tile', () => {
    expect(deriveBookingSortKey(null)).toBeNull();
    expect(deriveBookingSortKey({ fieldId: 'price', direction: 'desc' })).toBe(
      'price-desc'
    );
    expect(deriveBookingSortKey({ fieldId: 'nope', direction: 'asc' })).toBe(
      null
    );
  });

  it('sorts by appointment date, booked-on, price and status in both directions', () => {
    const sorted = (key: keyof typeof BOOKING_COMPARATORS) =>
      [...BOOKINGS].sort(BOOKING_COMPARATORS[key]).map((booking) => booking.id);

    expect(sorted('date-asc')).toEqual(['a', 'b']);
    expect(sorted('date-desc')).toEqual(['b', 'a']);
    expect(sorted('created-asc')).toEqual(['a', 'b']);
    expect(sorted('created-desc')).toEqual(['b', 'a']);
    expect(sorted('price-asc')).toEqual(['a', 'b']);
    expect(sorted('price-desc')).toEqual(['b', 'a']);
    // Confirmed < Cancelled alphabetically? "Cancelled" sorts first.
    expect(sorted('status-asc')).toEqual(['b', 'a']);
    expect(sorted('status-desc')).toEqual(['a', 'b']);
  });
});

describe('buildBookingFilterFields', () => {
  it("offers status, service, branch, pet, payment and appointment date, with options from the customer's own data", () => {
    const fields = buildBookingFilterFields(BOOKINGS, LOOKUPS);

    expect(fields.map((field) => field.id)).toEqual([
      'status',
      'service',
      'branch',
      'pet',
      'payment',
      'date',
    ]);

    const petField = fields.find((field) => field.id === 'pet');
    expect(petField && 'options' in petField ? petField.options : []).toEqual([
      { value: 'Biscuit', label: 'Biscuit' },
      { value: 'Mochi', label: 'Mochi' },
    ]);
  });

  it('labels payment statuses in customer-friendly words', () => {
    expect(paymentLabel('Pending')).toBe('Not paid yet');
    expect(paymentLabel('Fully Paid')).toBe('Fully paid');
  });
});

describe('buildBookingGroupByAxes', () => {
  it('groups by status, service, branch, pet, and month', () => {
    const axes = buildBookingGroupByAxes(BOOKINGS, LOOKUPS);

    expect(axes.map((axis) => axis.id)).toEqual([
      'status',
      'service',
      'branch',
      'pet',
      'month',
    ]);

    const status = axes.find((axis) => axis.id === 'status');
    expect(status?.columnFor(HOTEL)).toBe('Cancelled');
    expect(status?.columnFor(GROOMING)).toBe('Confirmed');

    const pet = axes.find((axis) => axis.id === 'pet');
    expect(pet?.columns).toEqual(['Biscuit', 'Mochi']);

    // Months come out chronologically, not alphabetically.
    const month = axes.find((axis) => axis.id === 'month');
    expect(month?.columns).toHaveLength(2);
    expect(month?.columnFor(GROOMING)).toBe(month?.columns[0]);
    expect(month?.columnFor(HOTEL)).toBe(month?.columns[1]);
  });
});

describe('bookingCalendarDateKey', () => {
  it('formats the booking start as a local YYYY-MM-DD key', () => {
    const start = new Date(2026, 7, 3, 9, 0, 0); // local time
    const key = bookingCalendarDateKey(
      buildBooking({ scheduled_start: start.toISOString() })
    );

    expect(key).toBe('2026-08-03');
  });
});
