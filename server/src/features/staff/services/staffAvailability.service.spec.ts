import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStaffAvailability } from './staffAvailability.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function createBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.lt = vi.fn(() => builder);
  builder.gt = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

  return builder;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  const builders: ReturnType<typeof createBuilder>[] = [];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder = createBuilder(result);
    builders.push(builder);

    return builder as never;
  });

  return builders;
}

const STAFF_PROFILE_RESULT: QueryResult = {
  data: { id: 'staff-1', branch_id: 'branch-a' },
  error: null,
};

function branchResult(operatingHours: Record<string, unknown>): QueryResult {
  return {
    data: { operating_hours: operatingHours, timezone: 'Asia/Manila' },
    error: null,
  };
}

// 2026-07-13 is a Monday (matches the "Monday" fixture already used by
// unavailabilityBlock.service.spec.ts). Asia/Manila is UTC+8, no DST.
const MONDAY_HOURS = { monday: { open: '09:00', close: '18:00' } };

describe('staffAvailability.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-1: returns the full operating-hours window for each day when there are no approved blocks', async () => {
    queueFromResults(STAFF_PROFILE_RESULT, branchResult(MONDAY_HOURS), {
      data: [],
      error: null,
    });

    const result = await getStaffAvailability({
      staffId: 'staff-1',
      rangeStart: '2026-07-13',
      rangeEnd: '2026-07-13',
    });

    expect(result.days).toEqual([
      {
        date: '2026-07-13',
        availableWindows: [
          {
            start: '2026-07-13T01:00:00.000Z',
            end: '2026-07-13T10:00:00.000Z',
          },
        ],
      },
    ]);
  });

  it('AC-2: returns the remaining sub-windows around a partially overlapping approved block', async () => {
    queueFromResults(STAFF_PROFILE_RESULT, branchResult(MONDAY_HOURS), {
      data: [
        {
          start_time: '2026-07-13T03:00:00.000Z',
          end_time: '2026-07-13T05:00:00.000Z',
        },
      ],
      error: null,
    });

    const result = await getStaffAvailability({
      staffId: 'staff-1',
      rangeStart: '2026-07-13',
      rangeEnd: '2026-07-13',
    });

    expect(result.days[0].availableWindows).toEqual([
      { start: '2026-07-13T01:00:00.000Z', end: '2026-07-13T03:00:00.000Z' },
      { start: '2026-07-13T05:00:00.000Z', end: '2026-07-13T10:00:00.000Z' },
    ]);
  });

  it('AC-3: returns no available windows when an approved block covers the entire operating-hours window', async () => {
    queueFromResults(STAFF_PROFILE_RESULT, branchResult(MONDAY_HOURS), {
      data: [
        {
          start_time: '2026-07-12T20:00:00.000Z',
          end_time: '2026-07-13T12:00:00.000Z',
        },
      ],
      error: null,
    });

    const result = await getStaffAvailability({
      staffId: 'staff-1',
      rangeStart: '2026-07-13',
      rangeEnd: '2026-07-13',
    });

    expect(result.days[0].availableWindows).toEqual([]);
  });

  it('AC-4: accepts a booking-overlap param and returns a clearly-labeled placeholder without throwing', async () => {
    queueFromResults(STAFF_PROFILE_RESULT, branchResult(MONDAY_HOURS), {
      data: [],
      error: null,
    });

    const result = await getStaffAvailability({
      staffId: 'staff-1',
      rangeStart: '2026-07-13',
      rangeEnd: '2026-07-13',
      bookingOverlap: { considerBookings: true },
    });

    expect(result.bookingOverlap).toEqual({
      considered: false,
      message: expect.stringContaining('bookings table does not exist yet'),
    });
  });

  it('AC-5: filters the unavailability-block query to status = approved, excluding pending/denied requests', async () => {
    const builders = queueFromResults(
      STAFF_PROFILE_RESULT,
      branchResult(MONDAY_HOURS),
      { data: [], error: null }
    );

    await getStaffAvailability({
      staffId: 'staff-1',
      rangeStart: '2026-07-13',
      rangeEnd: '2026-07-13',
    });

    const blocksBuilder = builders[2];
    const eqCalls = vi.mocked(blocksBuilder.eq).mock.calls;

    expect(eqCalls).toContainEqual(['staff_id', 'staff-1']);
    expect(eqCalls).toContainEqual(['status', 'approved']);
  });

  it('returns no windows for a day the branch has no operating-hours entry for, without erroring', async () => {
    queueFromResults(STAFF_PROFILE_RESULT, branchResult(MONDAY_HOURS), {
      data: [],
      error: null,
    });

    // 2026-07-14 is a Tuesday; MONDAY_HOURS has no "tuesday" entry.
    const result = await getStaffAvailability({
      staffId: 'staff-1',
      rangeStart: '2026-07-13',
      rangeEnd: '2026-07-14',
    });

    expect(result.days).toEqual([
      {
        date: '2026-07-13',
        availableWindows: [
          {
            start: '2026-07-13T01:00:00.000Z',
            end: '2026-07-13T10:00:00.000Z',
          },
        ],
      },
      { date: '2026-07-14', availableWindows: [] },
    ]);
  });

  it('rejects a range where rangeEnd is before rangeStart with 400', async () => {
    await expect(
      getStaffAvailability({
        staffId: 'staff-1',
        rangeStart: '2026-07-14',
        rangeEnd: '2026-07-13',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns 404 when the staff profile does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      getStaffAvailability({
        staffId: 'missing-staff',
        rangeStart: '2026-07-13',
        rangeEnd: '2026-07-13',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns 400 when the branch cannot be found for the staff member', async () => {
    queueFromResults(STAFF_PROFILE_RESULT, { data: null, error: null });

    await expect(
      getStaffAvailability({
        staffId: 'staff-1',
        rangeStart: '2026-07-13',
        rangeEnd: '2026-07-13',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
