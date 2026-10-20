import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkOutHotelStay,
  extensionDays,
  previewHotelCheckout,
  stayNights,
} from './checkout.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendStayCheckedOutNotification } from './careLogNotifications.service.ts';
import {
  postPayAtCheckoutCharge,
  quotePayAtCheckoutCharge,
} from '../../billing/services/payAtCheckoutCharge.service.ts';
import { postCheckoutExtras } from '../../billing/services/checkoutExtrasCharge.service.ts';
import { loadRemainingBalance } from '../../billing/services/transactionPayment.service.ts';

// The checked-out notification does its own Supabase lookups - mocked so
// they don't consume this spec's sequential supabase.from results.
vi.mock('./careLogNotifications.service.ts', () => ({
  sendStayCheckedOutNotification: vi.fn(),
}));

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

// Custom change (activity logbook): recordActivity is covered by its own
// unit tests (activityLog.service.spec.ts) - mocked wholesale here so these
// checkout tests don't need to account for its extra Supabase write in
// their sequential mock queue below.
vi.mock('./activityLog.service.ts', () => ({
  recordActivity: vi.fn().mockResolvedValue(undefined),
  recordBulkActivity: vi.fn().mockResolvedValue(undefined),
}));

// Covered by its own spec - here only the bill it is asked to post matters.
vi.mock('../../billing/services/payAtCheckoutCharge.service.ts', () => ({
  postPayAtCheckoutCharge: vi.fn(),
  quotePayAtCheckoutCharge: vi.fn(),
}));

// Covered by their own specs - here only the late fee posted and the
// balance read back matter.
vi.mock('../../billing/services/checkoutExtrasCharge.service.ts', () => ({
  postCheckoutExtras: vi.fn(),
}));
vi.mock('../../billing/services/transactionPayment.service.ts', () => ({
  loadRemainingBalance: vi.fn(),
}));

// Covered by its own spec. Mocked so its booking/service/pet lookups stay
// out of this file's sequential mock queues; null = "no long-stay deal".
vi.mock('../../booking/services/longStayTerms.service.ts', () => ({
  resolveBookingLongStayTerms: vi.fn(),
}));

import { resolveBookingLongStayTerms } from '../../booking/services/longStayTerms.service.ts';

const MAKATI_LONG_STAY = { minNights: 5, longStayRate: 750, regularRate: 850 };

const itemUpdates: unknown[] = [];

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'update', 'is', 'in']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        if (table === 'booking_items' && method === 'update') {
          itemUpdates.push(args[0]);
        }
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

/** completeBooking's own internal load-then-update, queued right after the
 * hotel_stays lookup and before the hotel_stays update - see checkout.
 * service.ts's call order. */
function completeBookingQueue(bookingId = 'booking-1') {
  return [
    { data: { id: bookingId, status: 'In Progress' }, error: null }, // completeBooking: load
    { data: { id: bookingId, status: 'Completed' }, error: null }, // completeBooking: update
  ];
}

/** assertChecklistComplete's own care_log_entries lookup, queued right
 * after the hotel_stays lookup and before completeBookingQueue - an empty
 * array means no outstanding tasks, so checkout proceeds. */
function noOutstandingTasksResult(): QueryResult {
  return { data: [], error: null };
}

const ACTIVE_STAY = {
  id: 'stay-1',
  booking_id: 'booking-1',
  scheduled_check_out_date: '2026-08-05',
  downpayment_amount: 1000,
  cage_id: 'cage-1',
  cages: { branch_id: 'branch-1' },
  bookings: { total_price: 2000, status: 'In Progress' },
};

/** The booking's Hotel item - 2 nights booked at ₱800 a night. A late
 * checkout's nights are billed at that same rate. */
const BOOKED_AT_800_A_NIGHT: QueryResult = {
  data: [
    {
      service_id: 'service-hotel',
      price_at_booking: 1600,
      duration_minutes_at_booking: 1440,
    },
  ],
  error: null,
};

const LATE_STAY = {
  ...ACTIVE_STAY,
  bookings: {
    ...ACTIVE_STAY.bookings,
    scheduled_start: '2026-08-03T02:00:00Z',
    scheduled_end: '2026-08-05T02:00:00Z',
  },
};

describe('checkout.service (#78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(resolveBookingLongStayTerms).mockResolvedValue(null);
    vi.mocked(postCheckoutExtras).mockResolvedValue({ id: 'txn-1' } as never);
    vi.mocked(loadRemainingBalance).mockResolvedValue(0);
  });

  describe('extensionDays', () => {
    it('is 0 for an on-time or early checkout', () => {
      expect(
        extensionDays('2026-08-05', new Date('2026-08-05T10:00:00Z'))
      ).toBe(0);
      expect(
        extensionDays('2026-08-05', new Date('2026-08-03T10:00:00Z'))
      ).toBe(0);
    });

    it('rounds any partial extension day up to a full day', () => {
      expect(
        extensionDays('2026-08-05', new Date('2026-08-06T02:00:00Z'))
      ).toBe(1);
      expect(
        extensionDays('2026-08-05', new Date('2026-08-07T09:00:00Z'))
      ).toBe(2);
    });

    it('counts Manila days, matching the cage card - not UTC ones', () => {
      // 07:30 Manila on the 6th is still the 5th in UTC.
      expect(
        extensionDays('2026-08-05', new Date('2026-08-05T23:30:00Z'))
      ).toBe(1);
      // 23:00 UTC on the 7th is the 8th in Manila.
      expect(
        extensionDays('2026-08-05', new Date('2026-08-07T23:00:00Z'))
      ).toBe(3);
    });
  });

  describe('stayNights', () => {
    it('counts Manila calendar days from check-in to checkout', () => {
      expect(
        stayNights(
          new Date('2026-08-03T02:00:00Z'),
          new Date('2026-08-06T01:00:00Z')
        )
      ).toBe(3);
    });

    it('is never less than one night', () => {
      expect(
        stayNights(
          new Date('2026-08-03T02:00:00Z'),
          new Date('2026-08-03T09:00:00Z')
        )
      ).toBe(1);
    });

    it('uses the Manila day, not the UTC one', () => {
      // 7 AM Monday to 9 AM Tuesday in Manila is one night, although the
      // check-in instant is still Sunday in UTC.
      expect(
        stayNights(
          new Date('2026-08-02T23:00:00Z'),
          new Date('2026-08-04T01:00:00Z')
        )
      ).toBe(1);
    });
  });

  // Pay at checkout (custom change): a Walk-in booking created with no
  // upfront charge is billed here for the nights actually stayed.
  describe('checkOutHotelStay - pay at checkout', () => {
    const PAY_AT_CHECKOUT_STAY = {
      ...ACTIVE_STAY,
      downpayment_amount: 0,
      check_in_at: '2026-08-03T02:00:00Z',
      // Booked as an estimated 2 nights at 800 a night.
      bookings: {
        total_price: 1600,
        status: 'In Progress',
        pay_at_checkout: true,
        scheduled_start: '2026-08-03T02:00:00Z',
        scheduled_end: '2026-08-05T02:00:00Z',
      },
    };

    const ITEMS = [
      {
        id: 'item-1',
        price_at_booking: 1600,
        duration_minutes_at_booking: 1440,
      },
    ];

    function queuePayAtCheckout() {
      queueFromResults(
        { data: PAY_AT_CHECKOUT_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        { data: { ...PAY_AT_CHECKOUT_STAY, extension_fee: null }, error: null },
        { data: {}, error: null }, // cages update
        { data: ITEMS, error: null }, // booking_items
        { data: null, error: null } // booking_items update
      );
    }

    beforeEach(() => {
      itemUpdates.length = 0;
      vi.mocked(postPayAtCheckoutCharge).mockResolvedValue({
        id: 'txn-1',
        total_amount: 2400,
      } as never);
    });

    it('bills the nights actually stayed, with no extension fee, when the pet stays longer than estimated', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-06T01:00:00Z')); // 3 nights

      queuePayAtCheckout();

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
        requesterId: 'staff-1',
      });

      expect(postPayAtCheckoutCharge).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        actualTotal: 2400,
        lineItem: {
          description: 'Hotel stay (3 nights)',
          quantity: 3,
          unitPrice: 800,
        },
        requesterId: 'staff-1',
      });
      expect(itemUpdates).toEqual([{ price_at_booking: 2400 }]);
      expect(result.extensionFee).toBeNull();
      expect(result.remainingBalance).toBe(2400);
      expect(result.payAtCheckout).toEqual({ nights: 3 });
      // The owner is told once, even on the pay-at-checkout path.
      expect(sendStayCheckedOutNotification).toHaveBeenCalledTimes(1);
      expect(sendStayCheckedOutNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          stayType: 'Hotel',
          branchId: 'branch-1',
          bookingId: 'booking-1',
        })
      );
    });

    it('bills fewer nights when the pet leaves earlier than estimated', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-04T01:00:00Z')); // 1 night
      vi.mocked(postPayAtCheckoutCharge).mockResolvedValue({
        id: 'txn-1',
        total_amount: 800,
      } as never);

      queuePayAtCheckout();

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(postPayAtCheckoutCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          actualTotal: 800,
          lineItem: {
            description: 'Hotel stay (1 night)',
            quantity: 1,
            unitPrice: 800,
          },
        })
      );
      expect(result.remainingBalance).toBe(800);
    });

    // Hotel long-stay rate (20261013260).
    describe('a stay on a service with a long-stay rate', () => {
      const LONG_STAY = {
        ...PAY_AT_CHECKOUT_STAY,
        // Booked as an estimated 6 nights at the long-stay 750 a night.
        bookings: {
          ...PAY_AT_CHECKOUT_STAY.bookings,
          total_price: 4500,
          scheduled_end: '2026-08-09T02:00:00Z',
        },
      };
      const LONG_STAY_ITEMS = [
        {
          id: 'item-1',
          service_id: 'service-hotel',
          price_at_booking: 4500,
          duration_minutes_at_booking: 1440,
        },
      ];

      function queueLongStay() {
        queueFromResults(
          { data: LONG_STAY, error: null },
          noOutstandingTasksResult(),
          ...completeBookingQueue(),
          { data: { ...LONG_STAY, extension_fee: null }, error: null },
          { data: {}, error: null }, // cages update
          { data: LONG_STAY_ITEMS, error: null }, // booking_items
          { data: null, error: null } // booking_items update
        );
      }

      beforeEach(() => {
        vi.mocked(resolveBookingLongStayTerms).mockResolvedValue(
          MAKATI_LONG_STAY
        );
      });

      it('pay at checkout never gets the long-stay rate: every night stayed is the regular one', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-11T01:00:00Z')); // 8 nights

        queueLongStay();

        await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

        expect(resolveBookingLongStayTerms).toHaveBeenCalledWith(
          'booking-1',
          'branch-1'
        );
        // 8 x 850 - not 6 x 750 + 2 x 850.
        expect(itemUpdates).toEqual([{ price_at_booking: 6800 }]);
        expect(postPayAtCheckoutCharge).toHaveBeenCalledWith(
          expect.objectContaining({ actualTotal: 6800 })
        );
      });

      it('corrects a stay booked at the long-stay rate even when it stays exactly the booked nights', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-09T01:00:00Z')); // 6 nights

        queueLongStay();

        await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

        // Booked at 6 x 750 = 4500; billed 6 x 850.
        expect(itemUpdates).toEqual([{ price_at_booking: 5100 }]);
        expect(postPayAtCheckoutCharge).toHaveBeenCalledWith(
          expect.objectContaining({ actualTotal: 5100 })
        );
      });

      it('5 nights or more is still the regular rate', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-08T01:00:00Z')); // 5 nights

        queueLongStay();

        await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

        expect(itemUpdates).toEqual([{ price_at_booking: 4250 }]); // 5 x 850
      });

      it('no longer a long stay when it ends under 5 nights: every night is the regular rate', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T01:00:00Z')); // 3 nights

        queueLongStay();

        await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

        expect(itemUpdates).toEqual([{ price_at_booking: 2550 }]); // 3 x 850
      });
    });

    it('keeps the checkout and reports the problem when the bill cannot be posted', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-06T01:00:00Z'));
      vi.mocked(postPayAtCheckoutCharge).mockRejectedValue(new Error('boom'));

      queuePayAtCheckout();

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' })
      ).rejects.toMatchObject({ statusCode: 500 });
    });

    it('an ordinary booking is never billed here', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        { data: { ...ACTIVE_STAY, extension_fee: null }, error: null },
        { data: {}, error: null }
      );

      await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

      expect(postPayAtCheckoutCharge).not.toHaveBeenCalled();
    });
  });

  describe('checkOutHotelStay', () => {
    it('AC-3/AC-4: on-time checkout leaves extension_fee null and reports what is still owed on Transactions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));
      vi.mocked(loadRemainingBalance).mockResolvedValue(1000);

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        {
          data: { ...ACTIVE_STAY, extension_fee: null },
          error: null,
        },
        { data: {}, error: null }
      );

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(result.extensionFee).toBeNull();
      expect(postCheckoutExtras).not.toHaveBeenCalled();
      expect(loadRemainingBalance).toHaveBeenCalledWith('booking-1', null);
      expect(result.remainingBalance).toBe(1000);
    });

    it('AC-3/AC-4: late checkout posts the fee to Transactions and reports the balance owed there', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-07T09:00:00Z')); // 2 days late
      vi.mocked(loadRemainingBalance).mockResolvedValue(2000);

      queueFromResults(
        { data: LATE_STAY, error: null },
        noOutstandingTasksResult(),
        BOOKED_AT_800_A_NIGHT,
        ...completeBookingQueue(),
        {
          data: { ...LATE_STAY, extension_fee: 1600 },
          error: null,
        },
        { data: {}, error: null }
      );

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      // Each late night at the booking's own nightly rate - no hourly fee.
      expect(result.extensionFee).toBe(1600);
      expect(postCheckoutExtras).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        lines: [
          {
            description: 'Late checkout (2 nights x ₱800)',
            quantity: 2,
            unit_price: 800,
            line_total: 1600,
            line_item_type: 'stay_extension',
          },
        ],
        requesterId: undefined,
      });
      // Read back after posting, so it is what Transactions now shows.
      expect(result.remainingBalance).toBe(2000);
    });

    it('a booking in a multi-booking checkout reads its balance off the group', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      const GROUPED = {
        ...ACTIVE_STAY,
        bookings: { ...ACTIVE_STAY.bookings, booking_group_id: 'group-1' },
      };

      queueFromResults(
        { data: GROUPED, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        { data: { ...GROUPED, extension_fee: null }, error: null },
        { data: {}, error: null }
      );

      await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

      expect(loadRemainingBalance).toHaveBeenCalledWith(null, 'group-1');
    });

    it('keeps the checkout and reports the problem when the late fee cannot be posted', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-07T09:00:00Z'));
      vi.mocked(postCheckoutExtras).mockRejectedValue(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      queueFromResults(
        { data: LATE_STAY, error: null },
        noOutstandingTasksResult(),
        BOOKED_AT_800_A_NIGHT,
        ...completeBookingQueue(),
        { data: { ...LATE_STAY, extension_fee: 1600 }, error: null },
        { data: {}, error: null }
      );

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' })
      ).rejects.toMatchObject({
        statusCode: 500,
        message:
          'The pet was checked out, but the ₱1600 late checkout fee could not be added to the bill - please add it at the cashier manually',
      });
    });

    it('falls back to the flat late fee only when the booking has no Hotel item to price a night by', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-06T09:00:00Z')); // 1 day late

      queueFromResults(
        { data: LATE_STAY, error: null },
        noOutstandingTasksResult(),
        { data: [], error: null }, // no booking items
        ...completeBookingQueue(),
        { data: { ...LATE_STAY, extension_fee: 500 }, error: null },
        { data: {}, error: null }
      );

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(result.extensionFee).toBe(500);
      expect(postCheckoutExtras).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              description: 'Late checkout (1 night x ₱500)',
            }),
          ],
        })
      );
    });

    it('Hotel long-stay rate: an overdue day is charged at the regular nightly rate instead of the flat fee', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-07T09:00:00Z')); // 2 days late
      vi.mocked(resolveBookingLongStayTerms).mockResolvedValue(
        MAKATI_LONG_STAY
      );

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        {
          data: { ...ACTIVE_STAY, extension_fee: 1700 },
          error: null,
        },
        { data: {}, error: null }
      );

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(resolveBookingLongStayTerms).toHaveBeenCalledWith(
        'booking-1',
        'branch-1'
      );
      expect(result.extensionFee).toBe(1700); // 2 x 850
      expect(postCheckoutExtras).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              description: 'Late checkout (2 nights x ₱850)',
              line_total: 1700,
            }),
          ],
        })
      );
    });

    it('does not look up a long-stay deal for an on-time checkout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        { data: { ...ACTIVE_STAY, extension_fee: null }, error: null },
        { data: {}, error: null }
      );

      await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

      expect(resolveBookingLongStayTerms).not.toHaveBeenCalled();
    });

    it('AC-4: releases the cage back to Available in the same call', async () => {
      // On time, so no late-night rate lookup joins the mock queue.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        { data: { ...ACTIVE_STAY }, error: null },
        { data: {}, error: null }
      );

      await checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' });

      expect(supabase.from).toHaveBeenCalledWith('cages');
    });

    it('rejects checkout on a stay whose booking has already finished (Completed/Paid)', async () => {
      queueFromResults({
        data: {
          ...ACTIVE_STAY,
          bookings: { ...ACTIVE_STAY.bookings, status: 'Completed' },
        },
        error: null,
      });

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects checkout on a stay whose booking never started (still Pending)', async () => {
      queueFromResults({
        data: {
          ...ACTIVE_STAY,
          bookings: { ...ACTIVE_STAY.bookings, status: 'Pending' },
        },
        error: null,
      });

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects checkout when the race-safe conditional update loses (actual_check_out_at was already set by a concurrent call)', async () => {
      // On time, so no late-night rate lookup joins the mock queue.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        noOutstandingTasksResult(),
        ...completeBookingQueue(),
        { data: null, error: null } // conditional update matched 0 rows - lost the race
      );

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects a stay belonging to a different branch', async () => {
      queueFromResults({ data: ACTIVE_STAY, error: null });

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-2' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('Custom change (checkout gating): rejects checkout while the Boarding Checklist still has Pending/In Progress tasks', async () => {
      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        {
          data: [
            { id: 'entry-1', status: 'Pending', scheduled_date: '2026-08-05' },
            {
              id: 'entry-2',
              status: 'In Progress',
              scheduled_date: '2026-08-05',
            },
          ],
          error: null,
        }
      );

      await expect(
        checkOutHotelStay({ stayId: 'stay-1', branchId: 'branch-1' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Boarding checklist has 2 incomplete tasks',
      });
    });

    it('Custom change (checkout gating): a Completed/Missed-only checklist does not block checkout', async () => {
      // On time, so no late-night rate lookup joins the mock queue.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        {
          data: [
            {
              id: 'entry-1',
              status: 'Completed',
              scheduled_date: '2026-08-04',
            },
            { id: 'entry-2', status: 'Missed', scheduled_date: '2026-08-03' },
          ],
          error: null,
        },
        ...completeBookingQueue(),
        { data: { ...ACTIVE_STAY }, error: null },
        { data: {}, error: null }
      );

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(result.stay).toBeDefined();
    });
  });

  describe('previewHotelCheckout', () => {
    /** Every query builder handed out - a preview must never update. */
    function expectNoWrites() {
      for (const result of vi.mocked(supabase.from).mock.results) {
        const builder = result.value as { update: ReturnType<typeof vi.fn> };
        expect(builder.update).not.toHaveBeenCalled();
      }
    }

    it('on time: the booked nights, nothing added, and what Transactions still says is owed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T01:00:00Z'));
      vi.mocked(loadRemainingBalance).mockResolvedValue(1000);

      queueFromResults({ data: LATE_STAY, error: null });

      const preview = await previewHotelCheckout('stay-1', 'branch-1');

      expect(preview.breakdown).toEqual({
        nights: 2,
        nightly_rate: 1000,
        stay_charge: 2000,
        discount: 0,
        late_nights: 0,
        late_rate: null,
        late_charge: 0,
        total: 2000,
        pay_at_checkout: false,
      });
      expect(preview.downpayment_collected).toBe(1000);
      expect(preview.added_at_checkout).toBe(0);
      expect(preview.amount_due).toBe(1000);
      expect(resolveBookingLongStayTerms).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('2 nights late: the late nights at the booked nightly rate, the same fee checkout posts', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-07T09:00:00Z'));
      vi.mocked(loadRemainingBalance).mockResolvedValue(1000);

      queueFromResults({ data: LATE_STAY, error: null }, BOOKED_AT_800_A_NIGHT);

      const preview = await previewHotelCheckout('stay-1', 'branch-1');

      expect(preview.breakdown).toMatchObject({
        late_nights: 2,
        late_rate: 800,
        late_charge: 1600,
        total: 3600,
      });
      expect(preview.added_at_checkout).toBe(1600);
      expect(preview.amount_due).toBe(2600);
      expectNoWrites();
    });

    it('a long-stay service: late nights are the regular rate', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-06T09:00:00Z'));
      vi.mocked(resolveBookingLongStayTerms).mockResolvedValue(
        MAKATI_LONG_STAY
      );

      queueFromResults({ data: LATE_STAY, error: null });

      const preview = await previewHotelCheckout('stay-1', 'branch-1');

      expect(preview.breakdown).toMatchObject({
        late_nights: 1,
        late_rate: 850,
        late_charge: 850,
      });
    });

    it('shows a discount fixed at booking as its own line', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T01:00:00Z'));

      queueFromResults({
        data: {
          ...LATE_STAY,
          bookings: {
            ...LATE_STAY.bookings,
            discount_amount: 200,
            promo_amount: 100,
          },
        },
        error: null,
      });

      const preview = await previewHotelCheckout('stay-1', 'branch-1');

      expect(preview.breakdown.discount).toBe(300);
      expect(preview.breakdown.total).toBe(1700);
    });

    it('pay at checkout: the nights stayed so far, quoted as checkout would bill them, without repricing', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-06T01:00:00Z')); // 3 nights
      vi.mocked(quotePayAtCheckoutCharge).mockResolvedValue({
        bill: 2400,
        discounts: 0,
      });
      itemUpdates.length = 0;

      queueFromResults(
        {
          data: {
            ...ACTIVE_STAY,
            downpayment_amount: 0,
            check_in_at: '2026-08-03T02:00:00Z',
            bookings: {
              total_price: 1600,
              status: 'In Progress',
              pay_at_checkout: true,
              scheduled_start: '2026-08-03T02:00:00Z',
              scheduled_end: '2026-08-05T02:00:00Z',
            },
          },
          error: null,
        },
        {
          data: [
            {
              id: 'item-1',
              price_at_booking: 1600,
              duration_minutes_at_booking: 1440,
            },
          ],
          error: null,
        }
      );

      const preview = await previewHotelCheckout('stay-1', 'branch-1');

      expect(quotePayAtCheckoutCharge).toHaveBeenCalledWith('booking-1', 2400);
      expect(preview.breakdown).toMatchObject({
        nights: 3,
        nightly_rate: 800,
        stay_charge: 2400,
        late_charge: 0,
        pay_at_checkout: true,
      });
      expect(preview.added_at_checkout).toBe(2400);
      expect(preview.amount_due).toBe(2400);
      expect(itemUpdates).toEqual([]);
      expectNoWrites();
    });

    it('rejects a stay belonging to a different branch', async () => {
      queueFromResults({ data: ACTIVE_STAY, error: null });

      await expect(
        previewHotelCheckout('stay-1', 'branch-2')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects a stay that is already checked out', async () => {
      queueFromResults({
        data: {
          ...ACTIVE_STAY,
          bookings: { ...ACTIVE_STAY.bookings, status: 'Completed' },
        },
        error: null,
      });

      await expect(
        previewHotelCheckout('stay-1', 'branch-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('checkout returns the same itemized bill the preview showed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-07T09:00:00Z'));

      queueFromResults({ data: LATE_STAY, error: null }, BOOKED_AT_800_A_NIGHT);
      const preview = await previewHotelCheckout('stay-1', 'branch-1');

      queueFromResults(
        { data: LATE_STAY, error: null },
        noOutstandingTasksResult(),
        BOOKED_AT_800_A_NIGHT,
        ...completeBookingQueue(),
        { data: { ...LATE_STAY, extension_fee: 1600 }, error: null },
        { data: {}, error: null }
      );
      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(result.bill).toEqual(preview.breakdown);
    });
  });
});
