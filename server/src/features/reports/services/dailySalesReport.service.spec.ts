import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailySalesReport } from './dailySalesReport.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn() },
}));

const REPORT = {
  breakdown: [
    {
      service_category: 'Grooming',
      payment_method: 'Cash',
      transaction_count: 3,
      gross_amount: 900,
    },
  ],
  totals: { transaction_count: 3, gross_amount: 900 },
  credit_usage: { transaction_count: 0, total_credit_applied: 0 },
  misc_sales: [],
  misc_sales_total: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDailySalesReport', () => {
  it('Admin/Supervisor are pinned to their own branch regardless of what branchId they pass', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: REPORT,
      error: null,
    } as never);

    await getDailySalesReport({
      requesterRole: 'Admin',
      requesterBranchId: 'branch-makati',
      branchId: 'branch-southwoods',
      reportDate: '2026-09-14',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_daily_sales_report', {
      p_branch_id: 'branch-makati',
      p_report_date: '2026-09-14',
    });
  });

  it('Superadmin may request a specific branch', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: REPORT,
      error: null,
    } as never);

    await getDailySalesReport({
      requesterRole: 'Superadmin',
      requesterBranchId: 'branch-makati',
      branchId: 'branch-southwoods',
      reportDate: '2026-09-14',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_daily_sales_report', {
      p_branch_id: 'branch-southwoods',
      p_report_date: '2026-09-14',
    });
  });

  it('Superadmin omitting a branch gets the combined-branches view (null)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: REPORT,
      error: null,
    } as never);

    await getDailySalesReport({
      requesterRole: 'Superadmin',
      requesterBranchId: 'branch-makati',
      branchId: null,
      reportDate: '2026-09-14',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_daily_sales_report', {
      p_branch_id: null,
      p_report_date: '2026-09-14',
    });
  });

  it('returns the RPC data as-is on success', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: REPORT,
      error: null,
    } as never);

    const result = await getDailySalesReport({
      requesterRole: 'Supervisor',
      requesterBranchId: 'branch-makati',
      reportDate: '2026-09-14',
    });

    expect(result).toEqual(REPORT);
  });

  it('throws a 400 when the RPC errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    } as never);

    await expect(
      getDailySalesReport({
        requesterRole: 'Supervisor',
        requesterBranchId: 'branch-makati',
        reportDate: '2026-09-14',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
