import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoAssignStaff,
  getStaffPickerOptions,
  isStaffPickerEnabled,
  listAvailableStaff,
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
  staff_picker_enabled_grooming: true,
  staff_picker_enabled_veterinary: true,
  created_at: '2026-07-18T00:00:00Z',
  updated_at: '2026-07-18T00:00:00Z',
};

const BRANCH_POLICY = {
  ...DEFAULT_POLICY,
  id: 'policy-branch',
  branch_id: 'branch-1',
  staff_picker_enabled_grooming: false,
};

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

      expect(policy.staff_picker_enabled_grooming).toBe(false);
    });

    it('falls back to the seeded default row when no branch row exists', async () => {
      queueFromResults({ data: [DEFAULT_POLICY], error: null });

      const policy = await resolveEffectivePolicy('branch-2');

      expect(policy.staff_picker_enabled_grooming).toBe(true);
      expect(policy.notice_period_days).toBe(3);
    });

    it('degrades to documented defaults if the seeded row was deleted out-of-band', async () => {
      queueFromResults({ data: [], error: null });

      const policy = await resolveEffectivePolicy('branch-1');

      expect(policy.notice_enforcement_mode).toBe('Strict');
      expect(policy.staff_picker_enabled_veterinary).toBe(true);
    });
  });

  describe('isStaffPickerEnabled', () => {
    it('is always false for Hotel/Daycare without touching the database', async () => {
      expect(await isStaffPickerEnabled('branch-1', 'Hotel')).toBe(false);
      expect(await isStaffPickerEnabled('branch-1', 'Daycare')).toBe(false);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('follows the per-branch Grooming toggle', async () => {
      queueFromResults({ data: [DEFAULT_POLICY, BRANCH_POLICY], error: null });

      expect(await isStaffPickerEnabled('branch-1', 'Grooming')).toBe(false);
    });
  });

  describe('listAvailableStaff', () => {
    it('maps Grooming -> Groomer and passes the window to the #49 RPC', async () => {
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
          p_role: 'Groomer',
          p_branch_id: 'branch-1',
          p_staff_id: null,
        })
      );
    });

    it('maps Veterinary -> Veterinarian (#52 AC-4)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [],
        error: null,
      } as never);

      await listAvailableStaff({ ...WINDOW, serviceCategory: 'Veterinary' });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_staff_availability',
        expect.objectContaining({ p_role: 'Veterinarian' })
      );
    });

    it('rejects categories with no staff-role mapping', async () => {
      await expect(
        listAvailableStaff({ ...WINDOW, serviceCategory: 'Hotel' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('getStaffPickerOptions', () => {
    it('AC-3: when the toggle is disabled, no staff list is ever exposed (RPC not called)', async () => {
      queueFromResults({ data: [DEFAULT_POLICY, BRANCH_POLICY], error: null });

      const result = await getStaffPickerOptions({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });

      expect(result).toEqual({ staff_picker_enabled: false, options: [] });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('AC-4: when enabled, "No preference" is always present and first', async () => {
      queueFromResults({ data: [DEFAULT_POLICY], error: null });
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
    it('picks the RPC-ordered first eligible staff member, or null when none', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: GROOMERS,
        error: null,
      } as never);

      const assigned = await autoAssignStaff({
        ...WINDOW,
        serviceCategory: 'Grooming',
      });

      expect(assigned?.staff_id).toBe('groomer-1');

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
            staff_picker_enabled_veterinary: false,
          },
          error: null,
        } // insert
      );

      const created = await updatePolicyConfiguration({
        input: {
          branch_id: 'branch-1',
          staff_picker_enabled_veterinary: false,
        },
      });

      expect(created.branch_id).toBe('branch-1');

      const insert = recordedWrites.find((write) => write.method === 'insert');

      expect(insert?.payload).toMatchObject({
        branch_id: 'branch-1',
        staff_picker_enabled_veterinary: false,
        // seeded from the effective policy, not silently reset
        staff_picker_enabled_grooming: true,
        notice_period_days: 3,
      });
    });
  });
});
