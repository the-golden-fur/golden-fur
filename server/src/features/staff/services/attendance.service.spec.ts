import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  listAvailableStaff,
  pickRandomAvailableStaff,
} from '../../booking/services/staffPicker.service.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { getAttendanceDay, setAttendance } from './attendance.service.ts';
import { resolveStaffCheckInBlock } from './attendanceAvailability.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('../../booking/services/availability.service.ts', () => ({
  resolveBranchDayWindow: () => ({
    start: new Date('2026-11-01T00:00:00Z'),
    end: new Date('2026-11-02T00:00:00Z'),
  }),
}));
vi.mock('../../booking/services/staffPicker.service.ts', () => ({
  listAvailableStaff: vi.fn(),
  pickRandomAvailableStaff: vi.fn(),
}));
vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));

const TODAY = '2026-11-01';

/** Tables answer in the order asked; every chain method records its call. */
function mockTables(results: Record<string, unknown[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = results[table]?.shift() ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};

    for (const method of [
      'select',
      'eq',
      'in',
      'is',
      'lt',
      'gt',
      'gte',
      'order',
      'update',
      'delete',
      'upsert',
    ]) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);

    return builder as never;
  }) as never);

  return calls;
}

const scope = {
  requesterId: 'me',
  requesterRole: 'Supervisor',
  requesterBranchId: 'b-1',
  branchId: 'b-1',
};

const ok = (data: unknown) => ({ data, error: null });
const baseTables = () => ({
  branches: [ok({ timezone: 'Asia/Manila' })],
  staff_profiles: [ok({ id: 's-1' })],
});

const booking = {
  id: 'bk-1',
  customer_id: 'c-1',
  branch_id: 'b-1',
  assigned_staff_id: 's-1',
  service_category: 'Grooming',
  scheduled_start: '2026-11-01T02:00:00Z',
  scheduled_end: '2026-11-01T03:00:00Z',
  pets: { name: 'Mochi' },
};

describe('setAttendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T04:00:00Z'));
  });

  const mark = (status: 'Present' | 'Absent' | 'Late', date = TODAY) =>
    setAttendance({ ...scope, staffId: 's-1', date, status });

  it('refuses another branch', async () => {
    await expect(
      setAttendance({
        ...scope,
        branchId: 'b-2',
        staffId: 's-1',
        date: TODAY,
        status: 'Late',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses marking yourself', async () => {
    await expect(
      setAttendance({ ...scope, staffId: 'me', date: TODAY, status: 'Late' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a past date', async () => {
    mockTables(baseTables());

    await expect(mark('Late', '2026-10-31')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('refuses staff from outside the branch', async () => {
    mockTables({ ...baseTables(), staff_profiles: [ok(null)] });

    await expect(mark('Late')).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['Sick Leave', 'Vacation Leave'])(
    'refuses %s',
    async (leave_type) => {
      mockTables({
        ...baseTables(),
        staff_unavailability_blocks: [ok([{ staff_id: 's-1', leave_type }])],
      });

      await expect(mark('Present')).rejects.toMatchObject({ statusCode: 409 });
    }
  );

  it('saves nothing for the default Present', async () => {
    const calls = mockTables(baseTables());

    await mark('Present');

    expect(calls.some((call) => call.method === 'delete')).toBe(true);
    expect(calls.some((call) => call.method === 'upsert')).toBe(false);
  });

  it('saves Present on a rest day, since that is the override', async () => {
    const calls = mockTables({
      ...baseTables(),
      staff_unavailability_blocks: [
        ok([{ staff_id: 's-1', leave_type: 'Rest Day' }]),
      ],
    });

    await mark('Present');

    expect(calls.some((call) => call.method === 'upsert')).toBe(true);
  });

  it('does not touch bookings for Late', async () => {
    const calls = mockTables(baseTables());

    await mark('Late');

    expect(calls.some((call) => call.table === 'bookings')).toBe(false);
  });

  it('moves a booking, its grooming session, and tells the customer', async () => {
    const calls = mockTables({
      ...baseTables(),
      bookings: [ok([booking]), ok({ id: 'bk-1' })],
    });
    const ben = { staff_id: 's-2', display_name: 'Ben' };
    vi.mocked(listAvailableStaff).mockResolvedValue([ben] as never);
    vi.mocked(pickRandomAvailableStaff).mockReturnValue(ben as never);

    const result = await mark('Absent');

    expect(result.reassigned).toMatchObject([
      { booking_id: 'bk-1', assigned_to: 'Ben' },
    ]);
    expect(result.needs_rescheduling).toEqual([]);
    expect(
      calls.find(
        (call) => call.table === 'grooming_sessions' && call.method === 'update'
      )?.args
    ).toEqual([{ assigned_groomer_id: 's-2' }]);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCustomerId: 'c-1',
        relatedBookingId: 'bk-1',
      })
    );
  });

  it('leaves a claimed consultation with its vet', async () => {
    const calls = mockTables({
      ...baseTables(),
      bookings: [
        ok([{ ...booking, service_category: 'Veterinary' }]),
        ok({ id: 'bk-1' }),
      ],
    });
    const ben = { staff_id: 's-2', display_name: 'Ben' };
    vi.mocked(listAvailableStaff).mockResolvedValue([ben] as never);
    vi.mocked(pickRandomAvailableStaff).mockReturnValue(ben as never);

    await mark('Absent');

    expect(
      calls.some(
        (call) =>
          call.table === 'consultations' &&
          call.method === 'is' &&
          call.args[0] === 'accepted_by'
      )
    ).toBe(true);
  });

  it('only looks at bookings that have not started', async () => {
    const calls = mockTables(baseTables());

    await mark('Absent');

    expect(
      calls.find(
        (call) =>
          call.table === 'bookings' &&
          call.method === 'in' &&
          call.args[0] === 'status'
      )?.args[1]
    ).toEqual(['Pending', 'Late']);
  });

  it('lists a booking nobody can take', async () => {
    mockTables({ ...baseTables(), bookings: [ok([booking])] });
    vi.mocked(listAvailableStaff).mockResolvedValue([]);
    vi.mocked(pickRandomAvailableStaff).mockReturnValue(undefined);

    const result = await mark('Absent');

    expect(result.reassigned).toEqual([]);
    expect(result.needs_rescheduling).toMatchObject([{ booking_id: 'bk-1' }]);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('getAttendanceDay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T04:00:00Z'));
  });

  it('defaults to Present, blanks rest days, and locks sick leave', async () => {
    mockTables({
      branches: [ok({ timezone: 'Asia/Manila' })],
      staff_profiles: [
        ok([
          { id: 'a', display_name: 'A', role: 'Groomer' },
          { id: 'b', display_name: 'B', role: 'Groomer' },
          { id: 'c', display_name: 'C', role: 'Groomer' },
        ]),
      ],
      staff_attendance: [ok([])],
      staff_unavailability_blocks: [
        ok([
          { staff_id: 'b', leave_type: 'Rest Day' },
          { staff_id: 'c', leave_type: 'Sick Leave' },
        ]),
      ],
    });

    const day = await getAttendanceDay({
      requesterRole: 'Supervisor',
      requesterBranchId: 'b-1',
      branchId: 'b-1',
    });

    expect(day.today).toBe(TODAY);
    expect(day.rows).toMatchObject([
      { staff_id: 'a', status: 'Present', locked: false },
      { staff_id: 'b', status: null, leave_type: 'Rest Day', locked: false },
      { staff_id: 'c', status: null, leave_type: 'Sick Leave', locked: true },
    ]);
  });
});

describe('resolveStaffCheckInBlock', () => {
  const present = { status: 'Present' as const, displayName: 'Ana' };

  it('blocks an Absent mark', () => {
    expect(
      resolveStaffCheckInBlock({
        staffName: 'Ana',
        mark: { status: 'Absent', displayName: 'Ana' },
        leaveTypes: [],
      })
    ).toContain('marked absent');
  });

  it('lets Present lift a Rest Day', () => {
    expect(
      resolveStaffCheckInBlock({
        staffName: 'Ana',
        mark: present,
        leaveTypes: ['Rest Day'],
      })
    ).toBeNull();
  });

  it('never lets Present lift Sick Leave', () => {
    expect(
      resolveStaffCheckInBlock({
        staffName: 'Ana',
        mark: present,
        leaveTypes: ['Sick Leave'],
      })
    ).toContain('Sick Leave');
  });

  it('does not let Late lift a Rest Day', () => {
    expect(
      resolveStaffCheckInBlock({
        staffName: 'Ana',
        mark: { status: 'Late', displayName: 'Ana' },
        leaveTypes: ['Rest Day'],
      })
    ).toContain('Rest Day');
  });
});
