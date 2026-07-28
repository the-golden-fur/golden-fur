import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDaySlots } from './availability.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number;
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

const BRANCH_ROW = {
  data: {
    timezone: 'Asia/Manila',
    operating_hours: {
      monday: { open: '09:00', close: '12:00' },
    },
  },
  error: null,
};

describe('availability.service (#56/#60 supporting infra)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('returns an empty slot list when the branch is closed that day (#56 AC-3)', async () => {
    queueFromResults({
      data: {
        timezone: 'Asia/Manila',
        operating_hours: {},
      },
      error: null,
    });

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03',
      slotDurationMinutes: 60,
      petWeightClass: 'S',
    });

    expect(slots).toEqual([]);
  });

  it('generates back-to-back Grooming slots and marks a fully-booked one as level "full"', async () => {
    queueFromResults(
      BRANCH_ROW, // branch lookup
      { data: null, error: null, count: 1 } // roster count (1 groomer)
    );

    // Roster count uses `.select(..., { count }).eq().eq().eq()` which our
    // builder resolves via the `then` handler; the RPC drives per-slot
    // eligibility below independently of the queued `from` results.
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Grooming',
      date: '2026-08-03', // a Monday
      slotDurationMinutes: 60,
    });

    // 09:00-12:00 in 60-minute steps => 3 slots.
    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => slot.level === 'full')).toBe(true);
    expect(slots.every((slot) => slot.available === false)).toBe(true);
  });

  it('requires pet_weight_class for Hotel', async () => {
    await expect(
      getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Hotel',
        date: '2026-08-03',
        slotDurationMinutes: 60,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('marks a Hotel slot "available" when no overlapping same-size bookings exist', async () => {
    queueFromResults(
      BRANCH_ROW, // branch lookup
      { data: [], error: null } // overlapping bookings (none) for the only slot
    );

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03',
      slotDurationMinutes: 180, // one slot spanning the whole 09:00-12:00 window
      petWeightClass: 'S',
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      available: true,
      level: 'available',
      cage_capacity_remaining: 10, // DEFAULT_HOTEL_CAGE_CAPACITY.S fallback
      cage_capacity_total: 10,
    });
  });

  it('never offers a Hotel slot on a fully past date, unlike a same-day slot (repro: navigating the Slot Picker back a few days still showed one as bookable)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T04:00:00.000Z')); // 2026-08-05 in Asia/Manila

    queueFromResults(BRANCH_ROW); // branch lookup only - must short-circuit before any overlap query

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03', // two days before "today" above
      slotDurationMinutes: 180,
      petWeightClass: 'S',
    });

    expect(slots).toEqual([]);
  });

  it('a Hotel booking spans past the same day close time (1440-minute duration) and still produces one candidate at opening time', async () => {
    queueFromResults(
      BRANCH_ROW, // branch lookup
      { data: [], error: null } // overlapping bookings (none)
    );

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03', // a Monday, 09:00-12:00 operating hours per BRANCH_ROW
      slotDurationMinutes: 1440, // the seeded Hotel service's one-night length
      petWeightClass: 'S',
    });

    expect(slots).toHaveLength(1);
    // Regression guard: the old back-to-back-within-[open,close] stepping
    // loop would never emit a candidate here at all (1440 min never fits
    // inside a 180-min window), silently showing "no availability" for
    // every Hotel booking attempt.
    expect(slots[0].start).toBe('2026-08-03T01:00:00.000Z'); // 09:00 Asia/Manila
    expect(slots[0].end).toBe('2026-08-04T01:00:00.000Z'); // +1440 min, next day
    expect(slots[0]).toMatchObject({ available: true, level: 'available' });
  });

  it('excludes same-day Grooming slots whose start time has already passed (repro: 8 AM shown as bookable at 3 PM)', async () => {
    // 10:30 Asia/Manila on the branch's Monday - the 09:00 and 10:00 slots
    // are already in the past; only 11:00 is still a real option.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T02:30:00.000Z'));

    queueFromResults(
      BRANCH_ROW, // branch lookup
      { data: null, error: null, count: 1 } // roster count (1 groomer)
    );
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Grooming',
      date: '2026-08-03',
      slotDurationMinutes: 60,
    });

    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe('2026-08-03T03:00:00.000Z'); // 11:00 Asia/Manila
  });

  it('still offers a same-day Hotel slot after the branch opening time has passed - actual arrival time is chosen at check-in, not here', async () => {
    // Same 10:30 Asia/Manila instant as above, well after the 09:00 opening
    // candidate - Hotel same-day booking must remain available regardless.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T02:30:00.000Z'));

    queueFromResults(
      BRANCH_ROW, // branch lookup
      { data: [], error: null } // overlapping bookings (none)
    );

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03',
      slotDurationMinutes: 180,
      petWeightClass: 'S',
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ available: true, level: 'available' });
  });
});
