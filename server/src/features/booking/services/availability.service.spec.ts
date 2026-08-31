import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDaySlots, resolveOperatingWindow } from './availability.service.ts';
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

    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'or',
      'is',
      'lt',
      'gt',
      'order',
    ]) {
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

/** Queued for getDaySlots' single resolveEffectivePolicy() lookup (notice
 * floor + lunch break). Both are disabled here so neither interferes with
 * these tests' own slot-count/level assertions - see the dedicated
 * lunch-break and minimum-notice describe blocks below for the enabled
 * cases. */
const POLICY_ROW_LUNCH_DISABLED = {
  data: [
    {
      id: 'policy-default',
      branch_id: null,
      notice_period_days: 3,
      notice_enforcement_mode: 'Strict',
      notice_enforcement_enabled: false,
      staff_picker_enabled_grooming: true,
      staff_picker_enabled_veterinary: true,
      lunch_break_enabled: false,
      lunch_break_start: '12:00:00',
      lunch_break_end: '13:00:00',
      created_at: '2026-07-18T00:00:00Z',
      updated_at: '2026-07-18T00:00:00Z',
    },
  ],
  error: null,
};

function policyRow(
  overrides: {
    lunch_break_enabled?: boolean;
    notice_enforcement_enabled?: boolean;
    notice_period_days?: number;
  } = {}
) {
  return {
    data: [
      {
        ...POLICY_ROW_LUNCH_DISABLED.data[0],
        ...overrides,
      },
    ],
    error: null,
  };
}

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
    // Pinned to a moment before the branch's 09:00-12:00 Asia/Manila window
    // opens, so none of the 3 generated slots are filtered out as already
    // past - without this, the assertion below silently depends on the real
    // wall-clock time never reaching that window on this date while CI runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // 08:00 Asia/Manila

    queueFromResults(
      BRANCH_ROW, // branch lookup
      POLICY_ROW_LUNCH_DISABLED, // lunch-break policy lookup
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

  it('marks every Hotel arrival candidate "available" when no overlapping same-size bookings exist', async () => {
    // Pinned before the branch's 09:00-12:00 Asia/Manila window opens - see
    // the same note on the Grooming test above.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // 08:00 Asia/Manila

    queueFromResults(
      BRANCH_ROW, // branch lookup
      POLICY_ROW_LUNCH_DISABLED, // lunch-break policy lookup
      { data: [], error: null }, // overlapping bookings (none) for 09:00
      { data: [], error: null }, // 10:00
      { data: [], error: null } // 11:00
    );

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03',
      slotDurationMinutes: 180, // 09:00-12:00 window, hourly arrival candidates
      petWeightClass: 'S',
    });

    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot).toMatchObject({
        available: true,
        level: 'available',
        cage_capacity_remaining: 10, // DEFAULT_HOTEL_CAGE_CAPACITY.S fallback
        cage_capacity_total: 10,
      });
    }
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

  it('a Hotel booking steps hourly across operating hours (1440-minute duration) and each candidate still runs to the next day', async () => {
    // Pinned before the branch's 09:00-12:00 Asia/Manila window opens - see
    // the same note on the Grooming test above.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // 08:00 Asia/Manila

    queueFromResults(
      BRANCH_ROW, // branch lookup
      POLICY_ROW_LUNCH_DISABLED, // lunch-break policy lookup
      { data: [], error: null }, // overlapping bookings for the 09:00 candidate
      { data: [], error: null }, // 10:00
      { data: [], error: null } // 11:00
    );

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03', // a Monday, 09:00-12:00 operating hours per BRANCH_ROW
      slotDurationMinutes: 1440, // the seeded Hotel service's one-night length
      petWeightClass: 'S',
    });

    // Regression guard: the old single-opening-time-only stepping would
    // never let a customer pick an actual arrival time; this now steps
    // hourly across [open, close) like every other category, while `end`
    // still always extends the full stay length past same-day close (the
    // old back-to-back-within-[open,close] stepping loop would never emit a
    // candidate at all here, since 1440 min never fits inside a 180-min
    // window - that regression guard still holds for every candidate below).
    expect(slots).toHaveLength(3);
    expect(slots[0].start).toBe('2026-08-03T01:00:00.000Z'); // 09:00 Asia/Manila
    expect(slots[0].end).toBe('2026-08-04T01:00:00.000Z'); // +1440 min, next day
    expect(slots[1].start).toBe('2026-08-03T02:00:00.000Z'); // 10:00
    expect(slots[2].start).toBe('2026-08-03T03:00:00.000Z'); // 11:00
    expect(
      slots.every((slot) => slot.available && slot.level === 'available')
    ).toBe(true);
  });

  it('excludes same-day Grooming slots whose start time has already passed (repro: 8 AM shown as bookable at 3 PM)', async () => {
    // 10:30 Asia/Manila on the branch's Monday - the 09:00 and 10:00 slots
    // are already in the past; only 11:00 is still a real option.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T02:30:00.000Z'));

    queueFromResults(
      BRANCH_ROW, // branch lookup
      POLICY_ROW_LUNCH_DISABLED, // lunch-break policy lookup
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

  it('excludes past-time Hotel arrival candidates just like every other category (repro: 9 AM/10 AM shown as bookable at 10:30 AM)', async () => {
    // 10:30 Asia/Manila - the 09:00 and 10:00 arrival candidates are already
    // in the past; only 11:00 is still a real option. Hotel now offers real
    // arrival-time candidates (see the hourly-stepping test above), so it no
    // longer gets a blanket exemption from this filter.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T02:30:00.000Z'));

    queueFromResults(
      BRANCH_ROW, // branch lookup
      POLICY_ROW_LUNCH_DISABLED, // lunch-break policy lookup
      { data: [], error: null } // overlapping bookings for the surviving 11:00 candidate
    );

    const slots = await getDaySlots({
      branchId: 'branch-1',
      serviceCategory: 'Hotel',
      date: '2026-08-03',
      slotDurationMinutes: 180,
      petWeightClass: 'S',
    });

    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe('2026-08-03T03:00:00.000Z'); // 11:00 Asia/Manila
    expect(slots[0]).toMatchObject({ available: true, level: 'available' });
  });

  describe('lunch break', () => {
    const WIDE_BRANCH_ROW = {
      data: {
        timezone: 'Asia/Manila',
        operating_hours: {
          monday: { open: '09:00', close: '15:00' },
        },
      },
      error: null,
    };

    it('drops the candidate overlapping the effective lunch break window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // 08:00 Asia/Manila

      queueFromResults(
        WIDE_BRANCH_ROW, // branch lookup
        policyRow({ lunch_break_enabled: true }), // lunch break 12:00-13:00
        { data: null, error: null, count: 1 } // roster count (1 groomer)
      );
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-03', // a Monday, 09:00-15:00 per WIDE_BRANCH_ROW
        slotDurationMinutes: 60,
      });

      // 09,10,11,12,13,14 candidates minus the 12:00-13:00 lunch slot => 5.
      expect(slots).toHaveLength(5);
      expect(slots.map((slot) => slot.start)).not.toContain(
        '2026-08-03T04:00:00.000Z' // 12:00 Asia/Manila
      );
    });

    it('keeps every candidate when the lunch break is disabled', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ lunch_break_enabled: false }),
        { data: null, error: null, count: 1 }
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

      expect(slots).toHaveLength(6);
    });
  });

  describe('minimum-notice lead time (advisor addendum)', () => {
    const WIDE_BRANCH_ROW = {
      data: {
        timezone: 'Asia/Manila',
        operating_hours: { monday: { open: '09:00', close: '15:00' } },
      },
      error: null,
    };

    it('returns [] for a day inside the notice window, exactly like a closed day', async () => {
      vi.useFakeTimers();
      // Monday 2026-08-03 08:00 Asia/Manila; a 3-day notice floor => the
      // earliest bookable date is 2026-08-06.
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW, // branch lookup
        policyRow({ notice_enforcement_enabled: true, notice_period_days: 3 })
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-04', // one day out - inside the window
        slotDurationMinutes: 60,
      });

      expect(slots).toEqual([]);
    });

    it('generates slots normally on the first day outside the notice window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ notice_enforcement_enabled: true, notice_period_days: 3 }),
        { data: null, error: null, count: 1 } // roster count
      );
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-10', // a Monday, well outside the 3-day window
        slotDurationMinutes: 60,
      });

      expect(slots.length).toBeGreaterThan(0);
    });

    it('applies no floor when notice enforcement is disabled', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ notice_enforcement_enabled: false, notice_period_days: 3 }),
        { data: null, error: null, count: 1 }
      );
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-03', // same day - allowed when enforcement is off
        slotDurationMinutes: 60,
      });

      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('resolveOperatingWindow', () => {
    it("resolves the branch's open/close for the requested date's weekday", async () => {
      queueFromResults(BRANCH_ROW); // branch lookup

      const window = await resolveOperatingWindow({
        branchId: 'branch-1',
        date: '2026-08-03', // a Monday, per BRANCH_ROW
      });

      expect(window).toEqual({ open: '09:00', close: '12:00' });
    });

    it('returns null when the branch is closed that day, without touching slot-stepping logic', async () => {
      queueFromResults({
        data: { timezone: 'Asia/Manila', operating_hours: {} },
        error: null,
      });

      const window = await resolveOperatingWindow({
        branchId: 'branch-1',
        date: '2026-08-03',
      });

      expect(window).toBeNull();
    });

    it('throws 404 when the branch does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        resolveOperatingWindow({ branchId: 'missing', date: '2026-08-03' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
