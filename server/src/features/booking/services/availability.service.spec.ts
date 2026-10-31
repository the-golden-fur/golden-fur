import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertCheckInAllowed,
  assertDaycareCareTimesWithinVisit,
  assertDaycareStartsBeforeCutoff,
  assertWithinGroomingHours,
  getDaySlots,
  resolveBranchClosedToday,
  resolveCheckInBlockReason,
  resolveOperatingWindow,
} from './availability.service.ts';
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
      booking_notice_period_days: 0,
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
    booking_notice_period_days?: number;
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
      {
        data: { staff_picker_enabled: true, eligible_staff_roles: ['Groomer'] },
        error: null,
      }, // resolveServiceTypeStaffConfig lookup
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

  // Custom change (book before assessment, 20261013264): a pet staff have
  // not assessed yet has no weight class - Hotel availability is then "any
  // cage at all" rather than a refusal.
  describe('Hotel without a pet weight class', () => {
    const ONE_STAY = {
      data: [{ id: 'b1', pet_id: 'p1', created_at: '' }],
      error: null,
    };
    const TWO_STAYS = {
      data: [
        { id: 'b1', pet_id: 'p1', created_at: '' },
        { id: 'b2', pet_id: 'p2', created_at: '' },
      ],
      error: null,
    };

    function slotsWith(overlapping: typeof ONE_STAY) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // 08:00 Asia/Manila
      // 1 + 1 + 0 + 0 = 2 cages in total, of any size.
      vi.stubEnv('HOTEL_CAGE_CAPACITY', '{"S":1,"M":1,"L":0,"XL":0}');

      queueFromResults(
        BRANCH_ROW, // branch lookup
        POLICY_ROW_LUNCH_DISABLED, // lunch-break policy lookup
        // The same overlap answer for every arrival candidate.
        overlapping,
        overlapping,
        overlapping,
        overlapping
      );

      return getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Hotel',
        date: '2026-08-03',
        slotDurationMinutes: 180,
      });
    }

    it('is no longer refused, and is available while any cage of any size is free', async () => {
      const slots = await slotsWith(ONE_STAY);

      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot).toMatchObject({
          available: true,
          cage_capacity_remaining: 1,
          cage_capacity_total: 2,
        });
      }
    });

    it('is full once every cage, whatever its size, is taken', async () => {
      const slots = await slotsWith(TWO_STAYS);

      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot).toMatchObject({
          available: false,
          cage_capacity_remaining: 0,
          cage_capacity_total: 2,
        });
      }
    });
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

    it('does not apply the lunch break to Hotel (regression: collapsed the whole day to "lunch_break_end onward")', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // 08:00 Asia/Manila

      queueFromResults(
        WIDE_BRANCH_ROW, // branch lookup
        policyRow({ lunch_break_enabled: true }), // lunch break 12:00-13:00
        { data: [], error: null }, // overlapping bookings for 09:00
        { data: [], error: null }, // 10:00
        { data: [], error: null }, // 11:00
        { data: [], error: null }, // 12:00 - inside the lunch window
        { data: [], error: null }, // 13:00
        { data: [], error: null } // 14:00
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Hotel',
        date: '2026-08-03', // a Monday, 09:00-15:00 per WIDE_BRANCH_ROW
        slotDurationMinutes: 1440,
        petWeightClass: 'S',
      });

      // All 6 hourly candidates survive, including 12:00 (the lunch-window
      // start) - the opposite of Grooming's behaviour just above.
      expect(slots).toHaveLength(6);
      expect(slots.map((slot) => slot.start)).toEqual([
        '2026-08-03T01:00:00.000Z', // 09:00
        '2026-08-03T02:00:00.000Z', // 10:00
        '2026-08-03T03:00:00.000Z', // 11:00
        '2026-08-03T04:00:00.000Z', // 12:00
        '2026-08-03T05:00:00.000Z', // 13:00
        '2026-08-03T06:00:00.000Z', // 14:00
      ]);
    });
  });

  describe('minimum-notice lead time', () => {
    const WIDE_BRANCH_ROW = {
      data: {
        timezone: 'Asia/Manila',
        // Mon 2026-08-03 and Mon 2026-08-10 both open; use a Monday date in
        // every case so a returned [] can only mean the notice floor, never a
        // closed weekday.
        operating_hours: { monday: { open: '09:00', close: '15:00' } },
      },
      error: null,
    };

    const openRpc = () =>
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

    it('new_booking: booking_notice_period_days floors the day (returns [] inside the window)', async () => {
      vi.useFakeTimers();
      // Mon 2026-08-03 08:00 Asia/Manila; a 2-day new-booking floor => the
      // earliest bookable date is 2026-08-05.
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ booking_notice_period_days: 2 })
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-04', // one day out - inside the window
        slotDurationMinutes: 60,
      });

      expect(slots).toEqual([]);
    });

    it('new_booking: at the default (0) a future date returns its full slot set', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ booking_notice_period_days: 0 }),
        { data: null, error: null, count: 1 } // roster count
      );
      openRpc();

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-10', // next Monday
        slotDurationMinutes: 60,
      });

      // 09:00-15:00 stepped by 60 => 6 candidate slots, none dropped.
      expect(slots).toHaveLength(6);
    });

    it('booking date limit: a day past today + max_advance_booking_days returns [], the last allowed day does not', async () => {
      vi.useFakeTimers();
      // Mon 2026-08-03 08:00 Asia/Manila.
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      // 6-day window => latest bookable date is 2026-08-09, so next Monday
      // (2026-08-10, open) is out of range.
      queueFromResults(
        {
          data: { ...WIDE_BRANCH_ROW.data, max_advance_booking_days: 6 },
          error: null,
        },
        policyRow({ booking_notice_period_days: 0 })
      );

      expect(
        await getDaySlots({
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          date: '2026-08-10',
          slotDurationMinutes: 60,
        })
      ).toEqual([]);

      // A 7-day window reaches 2026-08-10 exactly - full slot set.
      queueFromResults(
        {
          data: { ...WIDE_BRANCH_ROW.data, max_advance_booking_days: 7 },
          error: null,
        },
        policyRow({ booking_notice_period_days: 0 }),
        { data: null, error: null, count: 1 } // roster count
      );
      openRpc();

      expect(
        await getDaySlots({
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          date: '2026-08-10',
          slotDurationMinutes: 60,
        })
      ).toHaveLength(6);
    });

    it('new_booking: ignores notice_period_days (that is the reschedule knob)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({
          notice_enforcement_enabled: true,
          notice_period_days: 3,
          booking_notice_period_days: 0,
        }),
        { data: null, error: null, count: 1 }
      );
      openRpc();

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-10',
        slotDurationMinutes: 60,
      });

      expect(slots.length).toBeGreaterThan(0);
    });

    it('reschedule: still floored by notice_period_days (returns [] inside the window)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({
          notice_enforcement_enabled: true,
          notice_period_days: 3,
          booking_notice_period_days: 0,
        })
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-04', // inside the 3-day reschedule window
        slotDurationMinutes: 60,
        intent: 'reschedule',
      });

      expect(slots).toEqual([]);
    });

    it('a future date is never shifted by the current time-of-day', async () => {
      vi.useFakeTimers();
      // 13:00 Asia/Manila "now" - the old code would have dropped every
      // candidate before 13:00 on any date; a future date must be unaffected.
      vi.setSystemTime(new Date('2026-08-03T05:00:00.000Z'));

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ booking_notice_period_days: 0 }),
        { data: null, error: null, count: 1 }
      );
      openRpc();

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-10', // future Monday
        slotDurationMinutes: 60,
      });

      // The 09:00 candidate survives even though "now" is 13:00.
      expect(slots[0]?.start).toBe(
        new Date('2026-08-10T01:00:00.000Z').toISOString() // 09:00 Manila
      );
      expect(slots).toHaveLength(6);
    });

    it('today still drops slots whose start is already past', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-03T05:00:00.000Z')); // 13:00 Manila

      queueFromResults(
        WIDE_BRANCH_ROW,
        policyRow({ booking_notice_period_days: 0 }),
        { data: null, error: null, count: 1 }
      );
      openRpc();

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-03', // today
        slotDurationMinutes: 60,
      });

      // "now" is exactly 13:00; every candidate start <= 13:00 is dropped, so
      // only the 14:00 start remains.
      expect(slots.every((s) => new Date(s.start).getTime() > Date.now())).toBe(
        true
      );
      expect(slots).toHaveLength(1);
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

  describe('Daycare start times', () => {
    // Monday 2026-08-03. Daycare's last start is two hours before the
    // branch's closing time for the day. Asia/Manila is UTC+8.
    const branchClosingAt = (close: string) => ({
      data: {
        name: 'Southwoods',
        timezone: 'Asia/Manila',
        operating_hours: { monday: { open: '08:00', close } },
      },
      error: null,
    });

    const NO_STAFF_ROLES = {
      data: { staff_picker_enabled: false, eligible_staff_roles: [] },
      error: null,
    };

    /** "HH:MM" Asia/Manila on 2026-08-03 as the ISO instant slots carry. */
    const at = (time: string) => {
      const [hour, minute] = time.split(':').map(Number);
      return new Date(Date.UTC(2026, 7, 3, hour - 8, minute)).toISOString();
    };

    function pinBeforeOpening() {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-02T20:00:00.000Z')); // 04:00 Monday
    }

    async function daycareSlots(close: string, hours: number, lunch = false) {
      pinBeforeOpening();
      queueFromResults(
        branchClosingAt(close),
        policyRow({ lunch_break_enabled: lunch }),
        NO_STAFF_ROLES
      );

      return getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Daycare',
        date: '2026-08-03',
        slotDurationMinutes: hours * 60,
      });
    }

    it('offers a start every hour, whatever the number of hours booked', async () => {
      const slots = await daycareSlots('18:00', 4);

      // Every hour that still ends by the 18:00 close: 08:00 to 14:00.
      expect(slots.map((slot) => slot.start)).toEqual(
        ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'].map(at)
      );
      expect(slots[0]?.end).toBe(at('12:00'));
    });

    it('at a 9 PM branch, a 2-hour session can start as late as 7 PM', async () => {
      const slots = await daycareSlots('21:00', 2);

      expect(slots.at(-1)?.start).toBe(at('19:00'));
    });

    it('never starts later than two hours before closing, even for 1 hour', async () => {
      const slots = await daycareSlots('21:00', 1);

      // 20:00 would end by closing, but is past the 19:00 cutoff.
      expect(slots.at(-1)?.start).toBe(at('19:00'));
      expect(slots).toHaveLength(12); // 08:00 to 19:00
    });

    it('follows the closing time set for the day', async () => {
      const slots = await daycareSlots('18:00', 1);

      expect(slots.at(-1)?.start).toBe(at('16:00'));
    });

    it('is not affected by the lunch break', async () => {
      const slots = await daycareSlots('18:00', 4, true);

      expect(slots.map((slot) => slot.start)).toEqual(
        expect.arrayContaining(['10:00', '11:00', '12:00'].map(at))
      );
      expect(slots).toHaveLength(7);
    });

    it('does not apply the Daycare cutoff to another category', async () => {
      pinBeforeOpening();
      queueFromResults(
        branchClosingAt('18:00'),
        POLICY_ROW_LUNCH_DISABLED,
        NO_STAFF_ROLES
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Hotel',
        date: '2026-08-03',
        slotDurationMinutes: 1440,
        petWeightClass: 'S',
      });

      // Hourly arrival candidates across the whole 08:00-18:00 day.
      expect(slots).toHaveLength(10);
    });

    describe('assertDaycareStartsBeforeCutoff', () => {
      it('allows a start right up to two hours before closing', async () => {
        queueFromResults(branchClosingAt('21:00'));

        await expect(
          assertDaycareStartsBeforeCutoff('branch-1', at('19:00'))
        ).resolves.toBeUndefined();
      });

      it('rejects a later start, naming the time', async () => {
        queueFromResults(branchClosingAt('21:00'));

        await expect(
          assertDaycareStartsBeforeCutoff('branch-1', at('19:30'))
        ).rejects.toMatchObject({
          statusCode: 422,
          message: expect.stringContaining('7:00 PM'),
        });
      });
    });

    describe('assertDaycareCareTimesWithinVisit', () => {
      const VISIT_START = '2026-08-03T01:00:00.000Z'; // 9:00 AM Manila
      const VISIT_END = '2026-08-03T05:00:00.000Z'; // 1:00 PM Manila

      it('allows times inside the visit', async () => {
        queueFromResults({
          data: { timezone: 'Asia/Manila' },
          error: null,
        });

        await expect(
          assertDaycareCareTimesWithinVisit(
            'branch-1',
            VISIT_START,
            VISIT_END,
            { feeding: [{ scheduled_time: '12:59' }] }
          )
        ).resolves.toBeUndefined();
      });

      it('rejects a time at the end of the visit with a 422', async () => {
        queueFromResults({
          data: { timezone: 'Asia/Manila' },
          error: null,
        });

        await expect(
          assertDaycareCareTimesWithinVisit(
            'branch-1',
            VISIT_START,
            VISIT_END,
            { feeding: [{ scheduled_time: '13:00' }] }
          )
        ).rejects.toMatchObject({
          statusCode: 422,
          message: expect.stringContaining('Feeding at 1:00 PM'),
        });
      });

      it('does no branch lookup without care instructions', async () => {
        vi.mocked(supabase.from).mockClear();

        await assertDaycareCareTimesWithinVisit(
          'branch-1',
          VISIT_START,
          VISIT_END,
          undefined
        );

        expect(supabase.from).not.toHaveBeenCalled();
      });
    });
  });

  describe('per-branch Grooming hours', () => {
    // Monday: open 08:00-18:00, Grooming only 10:00-13:00. 2026-08-03 is a
    // Monday; Asia/Manila is UTC+8, so 10:00 local = 02:00 UTC.
    const BRANCH_WITH_GROOMING_HOURS = {
      data: {
        timezone: 'Asia/Manila',
        operating_hours: { monday: { open: '08:00', close: '18:00' } },
        grooming_hours: { monday: { open: '10:00', close: '13:00' } },
      },
      error: null,
    };

    const GROOMER_CONFIG = {
      data: { staff_picker_enabled: true, eligible_staff_roles: ['Groomer'] },
      error: null,
    };

    function pinBeforeOpening() {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-02T20:00:00.000Z')); // 04:00 Monday, Asia/Manila
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);
    }

    it('only generates Grooming slots inside the configured Grooming time', async () => {
      pinBeforeOpening();
      queueFromResults(
        BRANCH_WITH_GROOMING_HOURS,
        POLICY_ROW_LUNCH_DISABLED,
        GROOMER_CONFIG,
        { data: null, error: null, count: 1 }
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-03',
        slotDurationMinutes: 60,
      });

      expect(slots.map((slot) => slot.start)).toEqual([
        '2026-08-03T02:00:00.000Z', // 10:00
        '2026-08-03T03:00:00.000Z', // 11:00
        '2026-08-03T04:00:00.000Z', // 12:00
      ]);
    });

    it('leaves Grooming on the full operating hours for a day with no Grooming time set', async () => {
      pinBeforeOpening();
      queueFromResults(
        {
          data: {
            ...BRANCH_WITH_GROOMING_HOURS.data,
            grooming_hours: { tuesday: { open: '10:00', close: '13:00' } },
          },
          error: null,
        },
        POLICY_ROW_LUNCH_DISABLED,
        GROOMER_CONFIG,
        { data: null, error: null, count: 1 }
      );

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        date: '2026-08-03',
        slotDurationMinutes: 60,
      });

      // 08:00-18:00 in 60-minute steps.
      expect(slots).toHaveLength(10);
    });

    it('does not narrow another category to the Grooming time', async () => {
      pinBeforeOpening();
      queueFromResults(BRANCH_WITH_GROOMING_HOURS, POLICY_ROW_LUNCH_DISABLED, {
        data: { staff_picker_enabled: false, eligible_staff_roles: [] },
        error: null,
      });

      const slots = await getDaySlots({
        branchId: 'branch-1',
        serviceCategory: 'Daycare',
        date: '2026-08-03',
        slotDurationMinutes: 60,
      });

      // The full 08:00-18:00 day, up to Daycare's own 16:00 last start.
      expect(slots).toHaveLength(9);
    });

    it('clamps a Grooming time that runs past the operating hours', async () => {
      queueFromResults({
        data: {
          ...BRANCH_WITH_GROOMING_HOURS.data,
          grooming_hours: { monday: { open: '06:00', close: '20:00' } },
        },
        error: null,
      });

      await expect(
        resolveOperatingWindow({
          branchId: 'branch-1',
          date: '2026-08-03',
          serviceCategory: 'Grooming',
        })
      ).resolves.toEqual({ open: '08:00', close: '18:00' });
    });

    it('resolveOperatingWindow returns the Grooming time for Grooming and the operating hours otherwise', async () => {
      queueFromResults(BRANCH_WITH_GROOMING_HOURS);
      await expect(
        resolveOperatingWindow({
          branchId: 'branch-1',
          date: '2026-08-03',
          serviceCategory: 'Grooming',
        })
      ).resolves.toEqual({ open: '10:00', close: '13:00' });

      queueFromResults(BRANCH_WITH_GROOMING_HOURS);
      await expect(
        resolveOperatingWindow({
          branchId: 'branch-1',
          date: '2026-08-03',
          serviceCategory: 'Veterinary',
        })
      ).resolves.toEqual({ open: '08:00', close: '18:00' });
    });

    describe('assertWithinGroomingHours', () => {
      it('allows a booking inside the Grooming time', async () => {
        queueFromResults(BRANCH_WITH_GROOMING_HOURS);

        await expect(
          assertWithinGroomingHours(
            'branch-1',
            '2026-08-03T02:00:00.000Z', // 10:00
            '2026-08-03T05:00:00.000Z' // 13:00
          )
        ).resolves.toBeUndefined();
      });

      it('rejects a booking that starts before the Grooming time, naming the hours', async () => {
        queueFromResults(BRANCH_WITH_GROOMING_HOURS);

        await expect(
          assertWithinGroomingHours(
            'branch-1',
            '2026-08-03T01:00:00.000Z', // 09:00
            '2026-08-03T02:00:00.000Z'
          )
        ).rejects.toMatchObject({
          statusCode: 422,
          message: expect.stringContaining('10:00 AM to 1:00 PM'),
        });
      });

      it('rejects a booking that ends after the Grooming time', async () => {
        queueFromResults(BRANCH_WITH_GROOMING_HOURS);

        await expect(
          assertWithinGroomingHours(
            'branch-1',
            '2026-08-03T04:30:00.000Z', // 12:30
            '2026-08-03T05:30:00.000Z' // 13:30
          )
        ).rejects.toMatchObject({ statusCode: 422 });
      });

      it('is a no-op on a day with no Grooming time configured', async () => {
        queueFromResults(BRANCH_WITH_GROOMING_HOURS);

        // 2026-08-04 is a Tuesday - no grooming_hours entry.
        await expect(
          assertWithinGroomingHours(
            'branch-1',
            '2026-08-03T22:00:00.000Z', // 06:00 Tuesday
            '2026-08-03T23:00:00.000Z'
          )
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('check-in gate (clear check-in gate, groomer rest-day indicator)', () => {
    const OPEN_MONDAY_BRANCH = {
      data: {
        name: 'Makati',
        timezone: 'Asia/Manila',
        operating_hours: {
          monday: { open: '09:00', close: '18:00' },
        },
      },
      error: null,
    };

    describe('resolveBranchClosedToday', () => {
      it('is not closed on a day the branch has operating hours for', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // Monday 08:00 Manila

        queueFromResults(OPEN_MONDAY_BRANCH);

        const result = await resolveBranchClosedToday('branch-1');

        expect(result).toEqual({
          closed: false,
          reason: null,
          timezone: 'Asia/Manila',
        });
      });

      it('is closed on a day with no operating_hours entry (e.g. Sunday)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z')); // Sunday 08:00 Manila

        queueFromResults(OPEN_MONDAY_BRANCH);

        const result = await resolveBranchClosedToday('branch-1');

        expect(result.closed).toBe(true);
        expect(result.reason).toContain('Makati is closed today (Sunday)');
      });
    });

    describe('resolveCheckInBlockReason', () => {
      it('returns the branch-closed reason without ever querying staff_unavailability_blocks', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z')); // Sunday

        queueFromResults(OPEN_MONDAY_BRANCH);

        const reason = await resolveCheckInBlockReason({
          branchId: 'branch-1',
          assignedStaffId: 'groomer-1',
        });

        expect(reason).toContain('is closed today');
        expect(supabase.from).toHaveBeenCalledTimes(1); // branch lookup only
      });

      it('returns null when the branch is open and no staff is assigned (Hotel/Daycare)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // Monday

        queueFromResults(OPEN_MONDAY_BRANCH);

        const reason = await resolveCheckInBlockReason({
          branchId: 'branch-1',
          assignedStaffId: null,
        });

        expect(reason).toBeNull();
      });

      it('returns a clear reason when the assigned staff has an approved block covering right now', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // Monday 08:00 Manila

        queueFromResults(OPEN_MONDAY_BRANCH, {
          data: [
            {
              leave_type: 'Rest Day',
              staff: { display_name: 'Jane Dela Cruz' },
            },
          ],
          error: null,
        });

        const reason = await resolveCheckInBlockReason({
          branchId: 'branch-1',
          assignedStaffId: 'groomer-1',
        });

        expect(reason).toBe(
          "Jane Dela Cruz has an approved Rest Day today - check-in isn't available until they're back."
        );
      });

      it('returns null when no approved block covers the assigned staff right now', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // Monday 08:00 Manila

        queueFromResults(OPEN_MONDAY_BRANCH, { data: null, error: null });

        const reason = await resolveCheckInBlockReason({
          branchId: 'branch-1',
          assignedStaffId: 'groomer-1',
        });

        expect(reason).toBeNull();
      });

      it("queries only approved blocks for the assigned staff, within today's instant range", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z')); // Monday 08:00 Manila

        queueFromResults(OPEN_MONDAY_BRANCH, { data: null, error: null });

        await resolveCheckInBlockReason({
          branchId: 'branch-1',
          assignedStaffId: 'groomer-1',
        });

        const builder = vi.mocked(supabase.from).mock.results[1]!.value as {
          eq: ReturnType<typeof vi.fn>;
          lt: ReturnType<typeof vi.fn>;
          gt: ReturnType<typeof vi.fn>;
        };
        expect(builder.eq).toHaveBeenCalledWith('staff_id', 'groomer-1');
        expect(builder.eq).toHaveBeenCalledWith('status', 'approved');
        // Monday 2026-08-03 00:00 Asia/Manila (UTC+8) -> 2026-08-02T16:00:00.000Z;
        // next day 00:00 -> 2026-08-03T16:00:00.000Z.
        expect(builder.lt).toHaveBeenCalledWith(
          'start_time',
          '2026-08-03T16:00:00.000Z'
        );
        expect(builder.gt).toHaveBeenCalledWith(
          'end_time',
          '2026-08-02T16:00:00.000Z'
        );
      });
    });

    describe('assertCheckInAllowed', () => {
      it('resolves when nothing blocks check-in', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));

        queueFromResults(OPEN_MONDAY_BRANCH, { data: null, error: null });

        await expect(
          assertCheckInAllowed({
            branchId: 'branch-1',
            assignedStaffId: 'groomer-1',
          })
        ).resolves.toBeUndefined();
      });

      it('throws 409 with the resolved reason when blocked', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z')); // Sunday

        queueFromResults(OPEN_MONDAY_BRANCH);

        await expect(
          assertCheckInAllowed({ branchId: 'branch-1', assignedStaffId: null })
        ).rejects.toMatchObject({
          statusCode: 409,
          message: expect.stringContaining('is closed today'),
        });
      });
    });
  });
});
