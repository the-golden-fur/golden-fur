import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkOutHotelStay, extensionDays } from './checkout.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'update', 'is']) {
      builder[method] = vi.fn(() => builder);
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

const ACTIVE_STAY = {
  id: 'stay-1',
  booking_id: 'booking-1',
  scheduled_check_out_date: '2026-08-05',
  downpayment_amount: 1000,
  cage_id: 'cage-1',
  cages: { branch_id: 'branch-1' },
  bookings: { total_price: 2000, status: 'In Progress' },
};

describe('checkout.service (#78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
        extensionDays('2026-08-05', new Date('2026-08-07T23:00:00Z'))
      ).toBe(2);
    });
  });

  describe('checkOutHotelStay', () => {
    it('AC-3/AC-4: on-time checkout leaves extension_fee null and reconciles total - downpayment', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
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
      expect(result.remainingBalance).toBe(1000);
    });

    it('AC-3/AC-4: late checkout calculates a fee and reconciles total - downpayment + fee', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-07T09:00:00Z')); // 2 days late

      queueFromResults(
        { data: ACTIVE_STAY, error: null },
        ...completeBookingQueue(),
        {
          data: { ...ACTIVE_STAY, extension_fee: 1000 },
          error: null,
        },
        { data: {}, error: null }
      );

      const result = await checkOutHotelStay({
        stayId: 'stay-1',
        branchId: 'branch-1',
      });

      expect(result.extensionFee).toBe(1000);
      expect(result.remainingBalance).toBe(2000);
    });

    it('AC-4: releases the cage back to Available in the same call', async () => {
      queueFromResults(
        { data: ACTIVE_STAY, error: null },
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
      queueFromResults(
        { data: ACTIVE_STAY, error: null },
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
  });
});
