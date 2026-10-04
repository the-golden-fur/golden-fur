import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkOutDaycareSession,
  computeDaycareCharge,
  computeDaycareChargeBreakdown,
} from './daycareBilling.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';
import { postDaycareOverdueCharge } from './daycareOverdueCharge.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  completeBooking: vi.fn(),
}));

// Posting the overdue fee onto the booking's transactions is covered by its
// own unit tests (daycareOverdueCharge.service.spec.ts) - mocked here so
// these checkout tests don't need to queue its Supabase writes.
vi.mock('./daycareOverdueCharge.service.ts', () => ({
  postDaycareOverdueCharge: vi.fn().mockResolvedValue({ id: 'txn-overdue' }),
}));

// Custom change (activity logbook): recordActivity is covered by its own
// unit tests (activityLog.service.spec.ts) - mocked wholesale here so these
// checkout tests don't need to account for its extra Supabase write in
// their sequential mock queue below.
vi.mock('../../hotel/services/activityLog.service.ts', () => ({
  recordActivity: vi.fn().mockResolvedValue(undefined),
  recordBulkActivity: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedWrite {
  table: string;
  method: string;
  payload?: unknown;
}

const recordedWrites: RecordedWrite[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'in', 'is']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.update = vi.fn((payload?: unknown) => {
      recordedWrites.push({ table, method: 'update', payload });
      return builder;
    });

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    // Custom change (checkout gating): assertChecklistComplete's
    // care_log_entries lookup awaits the query builder directly (no
    // .maybeSingle()), same as checkout.service.spec.ts's builder.
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

/** assertChecklistComplete's own care_log_entries lookup, queued right
 * after the session lookup - an empty array means no outstanding tasks, so
 * checkout proceeds. */
function noOutstandingTasksResult(): QueryResult {
  return { data: [], error: null };
}

function minutesLater(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60000);
}

/** No operating_hours entries at all - every date's window lookup misses,
 * so countOvernightNights never finds a closing boundary to cross (nights
 * stays 0), matching the pre-#22 same-day-only behavior these tests exercise. */
const BRANCH_NO_HOURS = {
  data: { operating_hours: {}, timezone: 'Asia/Manila' },
  error: null,
};

/** resolveExpectedCheckoutAt's bookings lookup for a booking-linked session
 * whose booked end time doesn't matter to the test - no scheduled_end, so no
 * overdue split. */
const BOOKING_NO_END: QueryResult = { data: null, error: null };

describe('daycareBilling.service (#65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('computeDaycareCharge', () => {
    it('AC-3: exactly 1 hour or less is a flat ₱100', async () => {
      const start = new Date('2026-07-19T08:00:00Z');
      queueFromResults(BRANCH_NO_HOURS);
      expect(
        await computeDaycareCharge(start, minutesLater(start, 30), 'branch-1')
      ).toBe(100);
      queueFromResults(BRANCH_NO_HOURS);
      expect(
        await computeDaycareCharge(start, minutesLater(start, 60), 'branch-1')
      ).toBe(100);
    });

    it('rounds a partial succeeding hour up to a full billable hour (1h10m = ₱150)', async () => {
      const start = new Date('2026-07-19T08:00:00Z');
      queueFromResults(BRANCH_NO_HOURS);
      expect(
        await computeDaycareCharge(start, minutesLater(start, 70), 'branch-1')
      ).toBe(150);
    });

    it('2 hours flat is ₱150 (1 succeeding hour, no partial)', async () => {
      const start = new Date('2026-07-19T08:00:00Z');
      queueFromResults(BRANCH_NO_HOURS);
      expect(
        await computeDaycareCharge(start, minutesLater(start, 120), 'branch-1')
      ).toBe(150);
    });

    it("2h15m is ₱200 under the formula (see reviewer note in daycareBilling.service.ts - the Guide's AC-4 table claims ₱250, which is inconsistent with its own 1h10m worked example)", async () => {
      const start = new Date('2026-07-19T08:00:00Z');
      queueFromResults(BRANCH_NO_HOURS);
      expect(
        await computeDaycareCharge(start, minutesLater(start, 135), 'branch-1')
      ).toBe(200);
    });

    it('Custom change (Daycare fee configuration): a custom first-hour/succeeding-hour fee overrides the ₱100/₱50 defaults', async () => {
      const start = new Date('2026-07-19T08:00:00Z');
      queueFromResults(BRANCH_NO_HOURS);
      // 1h10m = 2 billable hours: first hour (₱200) + 1 succeeding hour (₱75).
      expect(
        await computeDaycareCharge(
          start,
          minutesLater(start, 70),
          'branch-1',
          200,
          75
        )
      ).toBe(275);
    });

    describe('not picked up before closing', () => {
      // Branch closes 18:00 Asia/Manila (10:00 UTC) every day; the session
      // spans 2026-07-19 08:00 UTC -> 2026-07-21 09:05 UTC, crossing two
      // closing boundaries (07-19 and 07-20), so 2 nights. Check-in is 2h
      // before the first closing, so the hourly part is 100 + 1 x 50 = 150
      // no matter how long after that the pet is actually picked up.
      const start = new Date('2026-07-19T08:00:00Z');
      const end = new Date('2026-07-21T09:05:00Z');
      const branchWithHours = {
        data: {
          operating_hours: {
            sunday: { open: '08:00', close: '18:00' },
            monday: { open: '08:00', close: '18:00' },
            tuesday: { open: '08:00', close: '18:00' },
          },
          timezone: 'Asia/Manila',
        },
        error: null,
      };

      function hotelServices(...prices: number[]): QueryResult {
        return {
          data: prices.map((base_price) => ({ base_price })),
          error: null,
        };
      }

      it("bills hourly only up to the first closing time, then the branch's Hotel nightly rate per night", async () => {
        queueFromResults(branchWithHours, hotelServices(850));

        expect(
          await computeDaycareChargeBreakdown(start, end, 'branch-1')
        ).toEqual({
          first_hour_fee: 100,
          succeeding_hours: 1,
          succeeding_hour_fee: 50,
          hourly_charge: 150,
          overdue_hours: 0,
          overdue_hour_fee: 50,
          overdue_charge: 0,
          nights: 2,
          nightly_rate: 850,
          overnight_charge: 1700,
          total: 1850,
        });
      });

      it('charges one night for a pet picked up the next morning', async () => {
        queueFromResults(branchWithHours, hotelServices(850));

        expect(
          await computeDaycareCharge(
            start,
            new Date('2026-07-20T01:00:00Z'),
            'branch-1'
          )
        ).toBe(150 + 850);
      });

      it("follows the Hotel service's own price, not the Daycare service's overnight fee", async () => {
        queueFromResults(branchWithHours, hotelServices(1000));

        expect(
          await computeDaycareCharge(
            start,
            end,
            'branch-1',
            undefined,
            undefined,
            900
          )
        ).toBe(150 + 2 * 1000);
      });

      it('uses the cheapest when a branch has several active Hotel services', async () => {
        queueFromResults(branchWithHours, hotelServices(1000, 700));

        expect(await computeDaycareCharge(start, end, 'branch-1')).toBe(
          150 + 2 * 700
        );
      });

      it("falls back to the Daycare service's own overnight fee when the branch has no Hotel service", async () => {
        queueFromResults(branchWithHours, hotelServices());

        expect(
          await computeDaycareCharge(
            start,
            end,
            'branch-1',
            undefined,
            undefined,
            900
          )
        ).toBe(150 + 2 * 900);
      });

      it('falls back to the documented ₱850 default when neither is set', async () => {
        queueFromResults(branchWithHours, hotelServices());

        expect(await computeDaycareCharge(start, end, 'branch-1')).toBe(
          150 + 2 * 850
        );
      });
    });

    describe('overdue checkout (past the booked end time)', () => {
      // Checked in 08:00, booked until 10:00 (2 booked hours = ₱150).
      const start = new Date('2026-07-19T08:00:00Z');
      const bookedEnd = minutesLater(start, 120);

      function breakdownAt(minutesAfterCheckIn: number) {
        queueFromResults(BRANCH_NO_HOURS);

        return computeDaycareChargeBreakdown(
          start,
          minutesLater(start, minutesAfterCheckIn),
          'branch-1',
          undefined,
          undefined,
          undefined,
          bookedEnd
        );
      }

      it('an on-time pickup has no overdue fee', async () => {
        expect(await breakdownAt(110)).toMatchObject({
          hourly_charge: 150,
          overdue_hours: 0,
          overdue_charge: 0,
          total: 150,
        });
      });

      it('a pickup within the 15-minute grace period is not charged for the extra minutes at all', async () => {
        expect(await breakdownAt(135)).toMatchObject({
          succeeding_hours: 1,
          hourly_charge: 150,
          overdue_hours: 0,
          overdue_charge: 0,
          total: 150,
        });
      });

      it('bills each overdue hour at a flat ₱50 on top of the booked hours, not the normal hourly rate as well', async () => {
        // 1h20m past the booked end -> 2 overdue hours.
        expect(await breakdownAt(200)).toMatchObject({
          succeeding_hours: 1,
          hourly_charge: 150,
          overdue_hours: 2,
          overdue_hour_fee: 50,
          overdue_charge: 100,
          total: 250,
        });
      });

      it("keeps the overdue fee flat even when the service's own succeeding-hour fee differs", async () => {
        queueFromResults(BRANCH_NO_HOURS);

        expect(
          await computeDaycareChargeBreakdown(
            start,
            minutesLater(start, 180),
            'branch-1',
            200,
            75,
            undefined,
            bookedEnd
          )
        ).toMatchObject({
          hourly_charge: 275,
          overdue_hours: 1,
          overdue_charge: 50,
          total: 325,
        });
      });

      it('stops counting overdue hours at closing time, where the nightly rate takes over', async () => {
        // Closes 18:00 Asia/Manila (10:00 UTC). Booked until 09:00 UTC,
        // picked up the next morning: 1 booked hour (₱100) + 1 overdue hour
        // up to closing (₱50) + 1 night.
        queueFromResults(
          {
            data: {
              operating_hours: {
                sunday: { open: '08:00', close: '18:00' },
                monday: { open: '08:00', close: '18:00' },
              },
              timezone: 'Asia/Manila',
            },
            error: null,
          },
          { data: [{ base_price: 850 }], error: null }
        );

        expect(
          await computeDaycareChargeBreakdown(
            start,
            new Date('2026-07-20T01:00:00Z'),
            'branch-1',
            undefined,
            undefined,
            undefined,
            minutesLater(start, 60)
          )
        ).toMatchObject({
          hourly_charge: 100,
          overdue_hours: 1,
          overdue_charge: 50,
          nights: 1,
          overnight_charge: 850,
          total: 1000,
        });
      });

      it('ignores a booked end time that is not after check-in', async () => {
        queueFromResults(BRANCH_NO_HOURS);

        expect(
          await computeDaycareChargeBreakdown(
            start,
            minutesLater(start, 120),
            'branch-1',
            undefined,
            undefined,
            undefined,
            minutesLater(start, -30)
          )
        ).toMatchObject({ hourly_charge: 150, overdue_hours: 0, total: 150 });
      });
    });

    it('a same-day pickup never looks up the Hotel rate', async () => {
      const start = new Date('2026-07-19T08:00:00Z');
      queueFromResults(BRANCH_NO_HOURS);

      const breakdown = await computeDaycareChargeBreakdown(
        start,
        minutesLater(start, 70),
        'branch-1'
      );

      expect(breakdown).toMatchObject({
        nights: 0,
        nightly_rate: null,
        overnight_charge: 0,
        total: 150,
      });
      // Only the branch's operating hours - no `services` query.
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkOutDaycareSession', () => {
    it('AC-5: sets status Completed and computed_charge together', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: null,
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: null,
            status: 'Completed',
            computed_charge: 100,
          },
          error: null,
        }
      );

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(result.status).toBe('Completed');
      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ status: 'Completed' });
      // The itemized breakdown rides along on the response and always adds
      // up to the stored charge.
      expect(result.charge_breakdown.total).toBe(
        (update?.payload as { computed_charge?: number }).computed_charge
      );
      expect(
        (update?.payload as { computed_charge?: number }).computed_charge
      ).not.toBeNull();
      // Walk-ins have no booking_id, so there's nothing to sync.
      expect(completeBooking).not.toHaveBeenCalled();
    });

    it("Custom change (Daycare fee configuration): resolves the fee schedule from the session's own service_id", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-19T08:30:00.000Z')); // 30 min after check-in

      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: null,
            branch_id: 'branch-1',
            service_id: 'service-premium-daycare',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        {
          data: {
            first_hour_fee: 200,
            succeeding_hour_fee: 75,
            daycare_overnight_fee: 900,
          },
          error: null,
        },
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: null,
            status: 'Completed',
            computed_charge: 200,
          },
          error: null,
        }
      );

      await checkOutDaycareSession({ sessionId: 'session-1' });

      const update = recordedWrites.find((write) => write.method === 'update');
      // 30 minutes elapsed - within the custom ₱200 first-hour fee, not the
      // documented ₱100 default.
      expect(
        (update?.payload as { computed_charge?: number }).computed_charge
      ).toBe(200);

      vi.useRealTimers();
    });

    it('a booking-linked session completes the linked booking on checkout', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        BOOKING_NO_END,
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
            computed_charge: 100,
          },
          error: null,
        }
      );

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(result.status).toBe('Completed');
      expect(completeBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });
    });

    it('stores the overdue fee on its own for a booked session picked up late', async () => {
      vi.useFakeTimers();
      // Checked in 08:00, booked until 10:00, picked up 11:30.
      vi.setSystemTime(new Date('2026-07-19T11:30:00.000Z'));

      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        { data: { scheduled_end: '2026-07-19T10:00:00.000Z' }, error: null },
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
          },
          error: null,
        }
      );

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      const update = recordedWrites.find((write) => write.method === 'update');
      // 2 booked hours (₱150) + 2 overdue hours (₱100).
      expect(update?.payload).toMatchObject({
        computed_charge: 250,
        extension_fee: 100,
      });
      expect(result.charge_breakdown.overdue_hours).toBe(2);
      // ...and posted onto the booking's transactions, so the cashier sees
      // and can collect it.
      expect(postDaycareOverdueCharge).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        overdueHours: 2,
        overdueFee: 100,
        requesterId: undefined,
      });

      vi.useRealTimers();
    });

    it('says so plainly when the pet was checked out but the overdue fee could not be added to the bill', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-19T11:30:00.000Z'));
      vi.mocked(postDaycareOverdueCharge).mockRejectedValueOnce(
        new Error('boom')
      );
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        { data: { scheduled_end: '2026-07-19T10:00:00.000Z' }, error: null },
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
          },
          error: null,
        }
      );

      await expect(
        checkOutDaycareSession({ sessionId: 'session-1' })
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('₱100 overdue checkout fee'),
      });
      // The checkout itself was saved before the charge was attempted.
      expect(
        recordedWrites.find((write) => write.method === 'update')?.payload
      ).toMatchObject({ status: 'Completed' });

      consoleError.mockRestore();
      vi.useRealTimers();
    });

    it('posts no overdue charge for a booked session picked up on time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-19T09:30:00.000Z'));

      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        { data: { scheduled_end: '2026-07-19T10:00:00.000Z' }, error: null },
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
          },
          error: null,
        }
      );

      await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(postDaycareOverdueCharge).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('leaves the overdue fee NULL for a walk-in, which has no booked end time', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: null,
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        BRANCH_NO_HOURS,
        { data: { id: 'session-1', status: 'Completed' }, error: null }
      );

      await checkOutDaycareSession({ sessionId: 'session-1' });

      const update = recordedWrites.find((write) => write.method === 'update');
      expect(update?.payload).toMatchObject({ extension_fee: null });
    });

    it('does not let a 409 from a stale/cancelled linked booking block checkout', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        noOutstandingTasksResult(),
        BOOKING_NO_END,
        BRANCH_NO_HOURS,
        {
          data: {
            id: 'session-1',
            booking_id: 'booking-1',
            status: 'Completed',
            computed_charge: 100,
          },
          error: null,
        }
      );

      const conflict = new Error('A Cancelled booking cannot be completed');
      (conflict as Error & { statusCode?: number }).statusCode = 409;
      vi.mocked(completeBooking).mockRejectedValueOnce(conflict);

      const result = await checkOutDaycareSession({ sessionId: 'session-1' });

      expect(result.status).toBe('Completed');
      expect(completeBooking).toHaveBeenCalledWith({ bookingId: 'booking-1' });
    });

    it('refuses to check out an already-Completed session', async () => {
      queueFromResults({
        data: {
          id: 'session-1',
          status: 'Completed',
          check_in_at: '2026-07-19T08:00:00.000Z',
        },
        error: null,
      });

      await expect(
        checkOutDaycareSession({ sessionId: 'session-1' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('Custom change (checkout gating): rejects checkout while the Boarding Checklist still has Pending/In Progress tasks', async () => {
      queueFromResults(
        {
          data: {
            id: 'session-1',
            booking_id: null,
            branch_id: 'branch-1',
            status: 'Active',
            check_in_at: '2026-07-19T08:00:00.000Z',
          },
          error: null,
        },
        {
          data: [
            { id: 'entry-1', status: 'Pending', scheduled_date: '2026-07-19' },
          ],
          error: null,
        }
      );

      await expect(
        checkOutDaycareSession({ sessionId: 'session-1' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Boarding checklist has 1 incomplete task',
      });
    });
  });
});
