import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkOutDaycareSession,
  computeDaycareCharge,
  computeDaycareChargeBreakdown,
} from './daycareBilling.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { completeBooking } from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  completeBooking: vi.fn(),
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
