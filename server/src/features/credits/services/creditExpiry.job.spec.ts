import { describe, expect, it, vi } from 'vitest';
import { runCreditExpiryJob } from './creditExpiry.job.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { rpc: vi.fn() },
}));

describe('creditExpiry.job (#93)', () => {
  it('AC-3: calls expire_credits() and returns the swept count', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: 3,
      error: null,
    } as never);

    const count = await runCreditExpiryJob();

    expect(count).toBe(3);
    expect(supabase.rpc).toHaveBeenCalledWith('expire_credits');
  });

  it('throws on an RPC error, unlike the best-effort logging helpers', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    } as never);

    await expect(runCreditExpiryJob()).rejects.toThrow(
      'Credit expiry job failed'
    );
  });
});
