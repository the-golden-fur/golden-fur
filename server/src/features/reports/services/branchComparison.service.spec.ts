import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBranchComparison } from './branchComparison.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn() },
}));

const ROWS = [
  {
    branch_id: 'branch-makati',
    branch_name: 'Makati',
    revenue_total: 1500,
    revenue_by_category: { Grooming: 1200 },
    counter_sales: 300,
    paid_transaction_count: 4,
    bookings_availed_total: 3,
    bookings_availed_by_category: { Grooming: 3 },
    new_customers: 2,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getBranchComparison', () => {
  it('passes the time filter through and returns every branch row', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: ROWS,
      error: null,
    } as never);

    const result = await getBranchComparison({
      requesterRole: 'Superadmin',
      timeFilter: 'this_month',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_branch_comparison', {
      p_time_filter: 'this_month',
    });
    expect(result).toEqual(ROWS);
  });

  it('returns an empty list when the function returns null', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: null,
    } as never);

    await expect(
      getBranchComparison({ requesterRole: 'Superadmin', timeFilter: 'today' })
    ).resolves.toEqual([]);
  });

  it.each(['Admin', 'Supervisor', 'Cashier'])(
    'rejects a %s with 403 without calling the database',
    async (role) => {
      await expect(
        getBranchComparison({ requesterRole: role, timeFilter: 'today' })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(supabase.rpc).not.toHaveBeenCalled();
    }
  );

  it('rejects an unknown time filter with 400', async () => {
    await expect(
      getBranchComparison({
        requesterRole: 'Superadmin',
        timeFilter: 'last_decade',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('surfaces a database error as 400', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    } as never);

    await expect(
      getBranchComparison({ requesterRole: 'Superadmin', timeFilter: 'today' })
    ).rejects.toMatchObject({ statusCode: 400, message: 'boom' });
  });
});
