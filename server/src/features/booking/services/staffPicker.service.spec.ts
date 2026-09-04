import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertMeetsBookingLeadTime,
  autoAssignStaff,
  bookingLeadDays,
  getStaffPickerOptions,
  isStaffPickerEnabled,
  listAvailableStaff,
  noticeLeadDays,
  resolveEffectivePolicy,
  updatePolicyConfiguration,
} from './staffPicker.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
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

    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'or',
      'is',
      'not',
      'lt',
      'gt',
      'order',
    ]) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      builder[method] = vi.fn((payload?: unknown) => {
        recordedWrites.push({ table, method, payload });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const DEFAULT_POLICY = {
  id: 'policy-default',
  branch_id: null,
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: true,
  booking_notice_period_days: 0,
  lunch_break_enabled: true,
  lunch_break_start: '12:00:00',
  lunch_break_end: '13:00:00',
  credit_expiry_mode: 'rolling',
  credit_expiry_days: 30,
  credit_expiry_fixed_date: null,
  created_at: '2026-07-18T00:00:00Z',
  updated_at: '2026-07-18T00:00:00Z',
};

const BRANCH_POLICY = {
  ...DEFAULT_POLICY,
  id: 'policy-branch',
  branch_id: 'branch-1',
  notice_period_days: 5,
};

/** service_types row shape resolveServiceTypeStaffConfig selects. */
function serviceTypeStaffRow(
  eligibleStaffRoles: string[],
  staffPickerEnabled = true
) {
  return {
    data: {
      staff_picker_enabled: staffPickerEnabled,
      eligible_staff_roles: eligibleStaffRoles,
    },
    error: null,
  };
}

const GROOMERS = [
  { staff_id: 'groomer-1', display_name: 'Ana', profile_photo_url: null },
  { staff_id: 'groomer-2', display_name: 'Ben', profile_photo_url: null },
];

const WINDOW = {
  branchId: 'branch-1',
  scheduledStart: '2026-08-03T01:00:00Z',
  scheduledEnd: '2026-08-03T02:00:00Z',
};

describe('staffPicker.service (#52)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('resolveEffectivePolicy', () => {
    it('branch-specific row overrides the system-wide default row', async () => {
      queueFromResults({
        data: [DEFAULT_POLICY, BRANCH_POLICY],
        error: null,
      });

      const policy = await resolveEffectivePolicy('branch-1');

      expect(policy.notice_period_days).toBe(5);
    });

    it('falls back to the seeded default row when no branch row exists', async () => {
      queueFromResults({ data: [DEFAULT_POLICY], error: null });

      const policy = await resolveEffectivePolicy('branch-2');

      expect(policy.notice_period_days).toBe(3);
    });

    it('degrades to documented defaults if the seeded row was deleted out-of-band', async () => {
      queueFromResults({ data: [], error: null });

      const policy = await resolveEffectivePolicy('branch-1');

      expect(policy.notice_enforcement_mode).toBe('Strict');
      expect(policy.lunch_break_enabled).toBe(true);
    });
  });

  describe('notice vs booking lead time', () => {
    it('noticeLeadDays reads notice_period_days only while enforcement is on', () => {
      expect(noticeLeadDays({ ...DEFAULT_POLICY } as never)).toBe(3);
      expect(
        noticeLeadDays({
          ...DEFAULT_POLICY,
          notice_enforcement_enabled: false,
        } as never)
      ).toBe(0);
    });

    it('bookingLeadDays reads booking_notice_period_days and is independent of the notice toggle', () => {
      expect(bookingLeadDays({ ...DEFAULT_POLICY } as never)).toBe(0);
      expect(
        bookingLeadDays({
          ...DEFAULT_POLICY,
          notice_enforcement_enabled: false,
          booking_notice_period_days: 2,
        } as never)
      ).toBe(2);
    });

    it('assertMeetsBookingLeadTime is a no-op at the default floor of 0 (no branch lookup)', async () => {
      await expect(
        assertMeetsBookingLeadTime(
          { ...DEFAULT_POLICY } as never,
          new Date(Date.now() + 3600_000).toISOString(),
          'branch-1'
        )
      ).resolves.toBeUndefined();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('assertMeetsBookingLeadTime throws 422 for a same-day slot when the floor is 2 (branch-tz calendar days)', async () => {
      queueFromResults({ data: { timezone: 'Asia/Manila' }, error: null });

      await expect(
        assertMeetsBookingLeadTime(
          { ...DEFAULT_POLICY, booking_notice_period_days: 2 } as never,
          new Date().toISOString(),
          'branch-1'
        )
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('assertMeetsBookingLeadTime accepts a slot well past the floor', async () => {
      queueFromResults({ data: { timezone: 'Asia/Manila' }, error: null });

      await expect(
        assertMeetsBookingLeadTime(
          { ...DEFAULT_POLICY, booking_notice_period_days: 2 } as never,
          new Date(Date.now() + 10 * 864e5).toISOString(),
          'branch-1'
        )
      ).resolves.toBeUndefined();
    });

    it('assertMeetsBookingLeadTime compares branch-tz calendar days, not the UTC day', async () => {
      vi.useFakeTimers();
      // 23:30 Asia/Manila on 2026-08-03 (still 15:30 UTC, same UTC day).
      vi.setSystemTime(new Date('2026-08-03T15:30:00.000Z'));

      // Floor 1 => earliest is 2026-08-04 Manila. A slot at 09:00 Manila on
      // the 4th (01:00 UTC) is on the earliest allowed Manila day - accepted,
      // even though it is a different UTC calendar day from "now".
      queueFromResults({ data: { timezone: 'Asia/Manila' }, error: null });
      await expect(
        assertMeetsBookingLeadTime(
          { ...DEFAULT_POLICY, booking_notice_period_days: 1 } as never,
          '2026-08-04T01:00:00.000Z',
          'branch-1'
        )
      ).resolves.toBeUndefined();

      // A slot still on 2026-08-03 Manila (23:45) is inside the window - 422.
      queueFromResults({ data: { timezone: 'Asia/Manila' }, error: null });
      await expect(
        assertMeetsBookingLeadTime(
          { ...DEFAULT_POLICY, booking_notice_period_days: 1 } as never,
          '2026-08-03T15:45:00.000Z',
          'branch-1'
        )
      ).rejects.toMatchObject({ statusCode: 422 });

      vi.useRealTimers();
    });
  });

  describe('isStaffPickerEnabled', () => {
    it('reflects the service_types row staff_picker_enabled flag - true', async () => {
      queueFromResults(serviceTypeStaffRow(['Groomer']));

      expect(await isStaffPickerEnabled('Grooming')).toBe(true);
    });

    it('reflects the service_types row staff_picker_enabled flag - false (e.g. Hotel/Daycare by default)', async () => {
      queueFromResults(serviceTypeStaffRow([], false));

      expect(await isStaffPickerEnabled('Hotel')).toBe(false);
    });

    it('degrades to false when no matching service_types row is found', async () => {
      queueFromResults({ data: null, error: null });

      expect(await isStaffPickerEnabled('Grooming')).toBe(false);
    });
  });

  describe('listAvailableStaff', () => {
    it('reads Grooming eligible roles from service_types and passes the window to the #49 RPC', async () => {
      queueFromResults(serviceTypeStaffRow(['Groomer']));
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: GROOMERS,
        error: null,
      } as never);

      const staff = await listAvailableStaff({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });

      expect(staff).toHaveLength(2);
      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_staff_availability',
        expect.objectContaining({
          p_roles: ['Groomer'],
          p_branch_id: 'branch-1',
          p_staff_id: null,
        })
      );
    });

    it('reads Veterinary eligible roles from service_types (#52 AC-4)', async () => {
      queueFromResults(serviceTypeStaffRow(['Veterinarian']));
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      await listAvailableStaff({ ...WINDOW, serviceCategory: 'Veterinary' });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_staff_availability',
        expect.objectContaining({ p_roles: ['Veterinarian'] })
      );
    });

    it('rejects categories with no eligible roles configured', async () => {
      queueFromResults(serviceTypeStaffRow([], false));

      await expect(
        listAvailableStaff({ ...WINDOW, serviceCategory: 'Hotel' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('getStaffPickerOptions', () => {
    it('AC-3: when the toggle is disabled, no staff list is ever exposed (RPC not called)', async () => {
      queueFromResults(serviceTypeStaffRow(['Groomer'], false));

      const result = await getStaffPickerOptions({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });

      expect(result).toEqual({ staff_picker_enabled: false, options: [] });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('AC-4: when enabled, "No preference" is always present and first', async () => {
      // isStaffPickerEnabled and listAvailableStaff each independently
      // resolve the service_types row - two queued fetches.
      queueFromResults(
        serviceTypeStaffRow(['Groomer']),
        serviceTypeStaffRow(['Groomer'])
      );
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: GROOMERS,
        error: null,
      } as never);

      const result = await getStaffPickerOptions({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });

      expect(result.staff_picker_enabled).toBe(true);
      expect(result.options[0]).toEqual({ type: 'no_preference' });
      expect(result.options).toHaveLength(3);
    });
  });

  describe('autoAssignStaff', () => {
    it('picks a random eligible staff member (not always the RPC-ordered first), or null when none', async () => {
      // One service_types fetch per autoAssignStaff -> listAvailableStaff call
      // below (three calls total).
      queueFromResults(
        serviceTypeStaffRow(['Groomer']),
        serviceTypeStaffRow(['Groomer']),
        serviceTypeStaffRow(['Groomer'])
      );
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: GROOMERS,
        error: null,
      } as never);

      const randomSpy = vi.spyOn(Math, 'random');

      randomSpy.mockReturnValueOnce(0);
      let assigned = await autoAssignStaff({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });
      expect(assigned?.staff_id).toBe('groomer-1');

      randomSpy.mockReturnValueOnce(0.9999);
      assigned = await autoAssignStaff({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });
      expect(assigned?.staff_id).toBe('groomer-2');

      randomSpy.mockRestore();

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      expect(
        await autoAssignStaff({ ...WINDOW, serviceCategory: 'Grooming' })
      ).toBeNull();
    });
  });

  describe('updatePolicyConfiguration', () => {
    it('AC-2: updates an existing row in place', async () => {
      queueFromResults(
        { data: DEFAULT_POLICY, error: null }, // existing lookup
        {
          data: { ...DEFAULT_POLICY, notice_period_days: 5 },
          error: null,
        } // update
      );

      const updated = await updatePolicyConfiguration({
        input: { notice_period_days: 5 },
      });

      expect(updated.notice_period_days).toBe(5);
      expect(recordedWrites).toContainEqual(
        expect.objectContaining({
          table: 'policy_configurations',
          method: 'update',
        })
      );
    });

    it('AC-2: creates a branch override row seeded from the effective policy when none exists', async () => {
      queueFromResults(
        { data: null, error: null }, // existing lookup - none
        { data: [DEFAULT_POLICY], error: null }, // baseline resolve
        {
          data: {
            ...BRANCH_POLICY,
            lunch_break_enabled: false,
          },
          error: null,
        } // insert
      );

      const created = await updatePolicyConfiguration({
        input: {
          branch_id: 'branch-1',
          lunch_break_enabled: false,
        },
      });

      expect(created.branch_id).toBe('branch-1');

      const insert = recordedWrites.find((write) => write.method === 'insert');

      expect(insert?.payload).toMatchObject({
        branch_id: 'branch-1',
        lunch_break_enabled: false,
        // seeded from the effective policy, not silently reset
        notice_period_days: 3,
      });
    });

    it('re-applies credit expiry to the one branch when a branch-override mode changes', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
      queueFromResults(
        { data: { ...BRANCH_POLICY }, error: null }, // existing lookup
        {
          data: {
            ...BRANCH_POLICY,
            credit_expiry_mode: 'fixed_date',
            credit_expiry_days: 30,
            credit_expiry_fixed_date: '2026-12-31',
          },
          error: null,
        } // update
      );

      await updatePolicyConfiguration({
        input: {
          branch_id: 'branch-1',
          credit_expiry_mode: 'fixed_date',
          credit_expiry_fixed_date: '2026-12-31',
        },
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'reapply_branch_credit_expiry',
        {
          p_branch_ids: ['branch-1'],
          p_mode: 'fixed_date',
          p_days: 30,
          p_fixed_date: '2026-12-31',
        }
      );
    });

    it('fans the re-apply out to override-less branches when the default row changes', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
      queueFromResults(
        { data: { ...DEFAULT_POLICY }, error: null }, // existing lookup
        {
          data: { ...DEFAULT_POLICY, credit_expiry_mode: 'none' },
          error: null,
        }, // update
        {
          data: [{ id: 'branch-1' }, { id: 'branch-2' }, { id: 'branch-3' }],
          error: null,
        }, // all branches
        { data: [{ branch_id: 'branch-2' }], error: null } // override rows
      );

      await updatePolicyConfiguration({
        input: { credit_expiry_mode: 'none' },
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'reapply_branch_credit_expiry',
        expect.objectContaining({
          p_branch_ids: ['branch-1', 'branch-3'],
          p_mode: 'none',
        })
      );
    });

    it('does not re-stamp credit expiry when an unrelated setting changes', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
      // The Policies page PATCHes all credit-expiry fields on every save, so
      // an unchanged mode/days/date must be a no-op.
      queueFromResults(
        { data: DEFAULT_POLICY, error: null },
        { data: { ...DEFAULT_POLICY, notice_period_days: 7 }, error: null }
      );

      await updatePolicyConfiguration({
        input: {
          notice_period_days: 7,
          credit_expiry_mode: 'rolling',
          credit_expiry_days: 30,
        },
      });

      expect(supabase.rpc).not.toHaveBeenCalledWith(
        'reapply_branch_credit_expiry',
        expect.anything()
      );
    });
  });
});
