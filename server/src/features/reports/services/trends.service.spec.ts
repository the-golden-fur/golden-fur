import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrends } from './trends.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn() },
}));

const BASE_PARAMS = {
  requesterBranchId: 'branch-own',
  dateFrom: '2026-10-01',
  dateTo: '2026-10-31',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.rpc).mockResolvedValue({
    data: {
      bookings_total: 5,
      bookings_by_pet_type: { Dog: 3, Cat: 2 },
      staff_bookings: [
        {
          staff_id: 'groomer-1',
          display_name: 'Ana',
          role: 'Groomer',
          bookings: 3,
          completed: 2,
        },
      ],
    },
    error: null,
  } as never);
});

describe('getTrends', () => {
  it('locks an Admin/Supervisor to their own branch, whatever they pass', async () => {
    await getTrends({
      ...BASE_PARAMS,
      requesterRole: 'Supervisor',
      branchId: 'branch-other',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_trends', {
      p_date_from: '2026-10-01',
      p_date_to: '2026-10-31',
      p_branch_id: 'branch-own',
    });
  });

  it('lets a Superadmin pick a branch or leave it out for every branch', async () => {
    await getTrends({
      ...BASE_PARAMS,
      requesterRole: 'Superadmin',
      branchId: 'branch-other',
    });
    await getTrends({
      ...BASE_PARAMS,
      requesterRole: 'Superadmin',
      branchId: null,
    });

    expect(vi.mocked(supabase.rpc).mock.calls[0][1]).toMatchObject({
      p_branch_id: 'branch-other',
    });
    expect(vi.mocked(supabase.rpc).mock.calls[1][1]).toMatchObject({
      p_branch_id: null,
    });
  });

  it('fills in empty defaults for keys the RPC leaves out', async () => {
    const report = await getTrends({
      ...BASE_PARAMS,
      requesterRole: 'Admin',
    });

    expect(report.bookings_total).toBe(5);
    expect(report.bookings_by_pet_type).toEqual({ Dog: 3, Cat: 2 });
    expect(report.staff_bookings).toHaveLength(1);
    expect(report.packages_booked).toEqual([]);
    expect(report.top_grooming_services).toEqual([]);
    expect(report.deleted_pet_reasons).toEqual({});
    expect(report.deleted_pet_other_notes).toEqual([]);
  });

  it('rejects a role outside Superadmin/Admin/Supervisor with 403', async () => {
    await expect(
      getTrends({ ...BASE_PARAMS, requesterRole: 'Groomer' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects a range that ends before it starts with 400', async () => {
    await expect(
      getTrends({
        ...BASE_PARAMS,
        requesterRole: 'Admin',
        dateFrom: '2026-10-31',
        dateTo: '2026-10-01',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a malformed date with 400', async () => {
    await expect(
      getTrends({ ...BASE_PARAMS, requesterRole: 'Admin', dateFrom: 'oct' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
