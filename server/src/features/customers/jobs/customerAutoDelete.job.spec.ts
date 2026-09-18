import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCustomerAutoDeleteJob } from './customerAutoDelete.job.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import * as customerArchiveService from '../services/customerArchive.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../services/customerArchive.service.ts', () => ({
  getCustomerAutoDeletePolicyDays: vi.fn(),
  deleteOrAnonymizeCustomer: vi.fn(),
}));

describe('customerAutoDelete.job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerArchiveService.getCustomerAutoDeletePolicyDays)
      .mockResolvedValue(30);
  });

  function mockDueCustomers(rows: Array<{ id: string }>) {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.lte = vi.fn(() => Promise.resolve({ data: rows, error: null }));
    vi.mocked(supabase.from).mockReturnValue(builder as never);
  }

  it('runs deleteOrAnonymizeCustomer for every customer past the threshold', async () => {
    mockDueCustomers([{ id: 'customer-1' }, { id: 'customer-2' }]);
    vi.mocked(customerArchiveService.deleteOrAnonymizeCustomer).mockResolvedValue(
      'deleted'
    );

    const processed = await runCustomerAutoDeleteJob();

    expect(processed).toBe(2);
    expect(customerArchiveService.deleteOrAnonymizeCustomer).toHaveBeenCalledWith(
      'customer-1'
    );
    expect(customerArchiveService.deleteOrAnonymizeCustomer).toHaveBeenCalledWith(
      'customer-2'
    );
  });

  it('isolates a per-row failure instead of aborting the whole batch', async () => {
    mockDueCustomers([{ id: 'customer-1' }, { id: 'customer-2' }]);
    vi.mocked(customerArchiveService.deleteOrAnonymizeCustomer)
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce('anonymized');

    const processed = await runCustomerAutoDeleteJob();

    // Only the successful row counts - the failure is logged, not thrown.
    expect(processed).toBe(1);
  });

  it('does nothing when no customer is past the threshold', async () => {
    mockDueCustomers([]);

    const processed = await runCustomerAutoDeleteJob();

    expect(processed).toBe(0);
    expect(customerArchiveService.deleteOrAnonymizeCustomer).not.toHaveBeenCalled();
  });
});
