import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markCreditIssuedOnLog,
  writeCancellationLog,
} from './cancellationLog.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function mockFrom(result: QueryResult) {
  const builder: Record<string, unknown> = {};

  builder.insert = vi.fn((payload: unknown) => {
    (builder as { _payload?: unknown })._payload = payload;
    return builder;
  });
  builder.update = vi.fn((payload: unknown) => {
    (builder as { _payload?: unknown })._payload = payload;
    return builder;
  });
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));

  vi.mocked(supabase.from).mockReturnValue(builder as never);

  return builder;
}

describe('cancellationLog.service (#91)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('writeCancellationLog', () => {
    it('AC-5: writes a row starting credit_issued: false / credit_amount: null', async () => {
      const builder = mockFrom({
        data: { id: 'log-1', credit_issued: false, credit_amount: null },
        error: null,
      });

      const result = await writeCancellationLog({
        bookingId: 'booking-1',
        customerId: 'cust-1',
        branchId: 'branch-1',
        eventType: 'cancellation',
        noticePeriodMet: true,
        enforcementModeApplied: 'Strict',
        policyViolation: false,
      });

      expect(result?.id).toBe('log-1');
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          credit_issued: false,
          credit_amount: null,
          event_type: 'cancellation',
        })
      );
    });

    it('is best-effort: a failed insert returns null instead of throwing', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });

      const result = await writeCancellationLog({
        bookingId: 'booking-1',
        customerId: 'cust-1',
        branchId: 'branch-1',
        eventType: 'reschedule',
        noticePeriodMet: false,
        enforcementModeApplied: 'Soft',
        policyViolation: true,
      });

      expect(result).toBeNull();
    });
  });

  describe('markCreditIssuedOnLog', () => {
    it('patches credit_issued/credit_amount on the given row', async () => {
      const builder = mockFrom({ data: null, error: null });

      await markCreditIssuedOnLog('log-1', 500);

      expect(builder.update).toHaveBeenCalledWith({
        credit_issued: true,
        credit_amount: 500,
      });
      expect(builder.eq).toHaveBeenCalledWith('id', 'log-1');
    });

    it('is best-effort: swallows an update error without throwing', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });

      await expect(
        markCreditIssuedOnLog('log-1', 500)
      ).resolves.toBeUndefined();
    });
  });
});
