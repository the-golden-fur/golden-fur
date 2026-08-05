import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueCredit } from './creditIssuance.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn() },
}));

describe('creditIssuance.service (#93)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('AC-1: calls the atomic issue_credit() RPC with the right params and returns its row', async () => {
    const transaction = {
      id: 'txn-1',
      credit_balance_id: 'balance-1',
      transaction_type: 'issuance',
      amount: 500,
      cancellation_log_id: 'log-1',
      transaction_id: null,
      expires_at: '2026-09-04T00:00:00.000Z',
      expired_at: null,
      created_at: '2026-08-05T00:00:00.000Z',
    };

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: transaction,
      error: null,
    } as never);

    const result = await issueCredit({
      customerId: 'cust-1',
      branchId: 'branch-1',
      amount: 500,
      cancellationLogId: 'log-1',
      expiresAt: '2026-09-04T00:00:00.000Z',
    });

    expect(result).toEqual(transaction);
    expect(supabase.rpc).toHaveBeenCalledWith('issue_credit', {
      p_customer_id: 'cust-1',
      p_branch_id: 'branch-1',
      p_amount: 500,
      p_cancellation_log_id: 'log-1',
      p_expires_at: '2026-09-04T00:00:00.000Z',
    });
  });

  it('returns null (never throws) when the RPC errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    } as never);

    const result = await issueCredit({
      customerId: 'cust-1',
      branchId: 'branch-1',
      amount: 500,
      cancellationLogId: 'log-1',
      expiresAt: null,
    });

    expect(result).toBeNull();
  });
});
