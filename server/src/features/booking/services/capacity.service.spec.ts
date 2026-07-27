import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkCapacity,
  confirmCapacityAfterInsert,
} from './capacity.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { Booking } from '../booking.types.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'neq', 'in', 'lt', 'gt', 'order']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const WINDOW = {
  branchId: 'branch-1',
  scheduledStart: '2026-08-03T01:00:00Z',
  scheduledEnd: '2026-08-03T02:00:00Z',
};

const GROOMER = {
  staff_id: 'groomer-1',
  display_name: 'Ana',
  profile_photo_url: null,
};

describe('capacity.service (#51)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('checkCapacity - Grooming/Veterinary (staff-count path)', () => {
    it('AC-2: available when at least one staff member passes the #49 RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [GROOMER],
        error: null,
      } as never);

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });

      expect(result.available).toBe(true);
      expect(result.eligibleStaff).toHaveLength(1);
    });

    it('AC-2: rejected with a staff-capacity reason when nobody is eligible', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Veterinary',
      });

      expect(result.available).toBe(false);
      expect(result.reason).toContain('No eligible staff');
    });

    it('re-verifies a single specific staff member when staffId is passed (#49 AC-5 shape)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Grooming',
        staffId: 'groomer-9',
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_staff_availability',
        expect.objectContaining({ p_staff_id: 'groomer-9' })
      );
      expect(result.reason).toContain('selected staff member');
    });
  });

  describe('checkCapacity - Hotel (cage-count stub)', () => {
    it('AC-2: rejected when same-size overlapping Confirmed bookings reach cage capacity', async () => {
      vi.stubEnv('HOTEL_CAGE_CAPACITY', '{"S":1}');
      queueFromResults(
        {
          data: [{ id: 'b-other', pet_id: 'pet-2', created_at: '' }],
          error: null,
        }, // overlapping bookings
        { data: [{ id: 'pet-2' }], error: null } // same-size pets
      );

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Hotel',
        petWeightClass: 'S',
      });

      expect(result.available).toBe(false);
      expect(result.reason).toContain('S-size cages');
    });

    it('available when no overlapping bookings occupy the size category', async () => {
      queueFromResults({ data: [], error: null });

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Hotel',
        petWeightClass: 'XL',
      });

      expect(result.available).toBe(true);
    });

    it('requires the pet weight class', async () => {
      await expect(
        checkCapacity({ ...WINDOW, serviceCategory: 'Hotel' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('#78 (Sprint 4, M05): with no env override, capacity is the real count of cages of that size at the branch', async () => {
      queueFromResults(
        {
          data: [
            { id: 'b1', pet_id: 'p1', created_at: '' },
            { id: 'b2', pet_id: 'p2', created_at: '' },
          ],
          error: null,
        }, // overlapping bookings
        { data: [{ id: 'p1' }, { id: 'p2' }], error: null }, // same-size pets
        { data: null, error: null, count: 2 } // cages count query
      );

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Hotel',
        petWeightClass: 'L',
      });

      // 2 same-size overlapping Confirmed bookings already fill the 2 real
      // cages of that size - the old DEFAULT_HOTEL_CAGE_CAPACITY.L stub (6)
      // would have incorrectly reported this as available.
      expect(result.available).toBe(false);
    });
  });

  describe('checkCapacity - Daycare (session-capacity stub)', () => {
    it('AC-2: rejected when the per-branch session capacity is full', async () => {
      vi.stubEnv('DAYCARE_SESSION_CAPACITY', '1');
      queueFromResults({
        data: [{ id: 'b-other', pet_id: 'pet-2', created_at: '' }],
        error: null,
      });

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Daycare',
      });

      expect(result.available).toBe(false);
      expect(result.reason).toContain('Daycare session capacity');
    });

    it('available below capacity', async () => {
      queueFromResults({ data: [], error: null });

      const result = await checkCapacity({
        ...WINDOW,
        serviceCategory: 'Daycare',
      });

      expect(result.available).toBe(true);
    });
  });

  describe('confirmCapacityAfterInsert (AC-5 race re-verification)', () => {
    const GROOMING_BOOKING = {
      id: 'booking-mine',
      branch_id: 'branch-1',
      pet_id: 'pet-1',
      service_category: 'Grooming',
      assigned_staff_id: 'groomer-1',
      scheduled_start: WINDOW.scheduledStart,
      scheduled_end: WINDOW.scheduledEnd,
    } as unknown as Booking;

    it('wins when its row is the earliest overlapping Confirmed row for the staff member', async () => {
      queueFromResults({
        data: [{ id: 'booking-mine' }, { id: 'booking-racer' }],
        error: null,
      });

      expect(await confirmCapacityAfterInsert(GROOMING_BOOKING)).toBe(true);
    });

    it('loses (deterministically) when another row was created first', async () => {
      queueFromResults({
        data: [{ id: 'booking-racer' }, { id: 'booking-mine' }],
        error: null,
      });

      expect(await confirmCapacityAfterInsert(GROOMING_BOOKING)).toBe(false);
    });

    it('Daycare: wins only while ranked within capacity', async () => {
      vi.stubEnv('DAYCARE_SESSION_CAPACITY', '1');
      queueFromResults({
        data: [
          { id: 'booking-racer', pet_id: 'pet-2', created_at: '' },
          { id: 'booking-mine', pet_id: 'pet-1', created_at: '' },
        ],
        error: null,
      });

      const daycareBooking = {
        ...GROOMING_BOOKING,
        service_category: 'Daycare',
        assigned_staff_id: null,
      } as unknown as Booking;

      expect(await confirmCapacityAfterInsert(daycareBooking)).toBe(false);
    });
  });
});
