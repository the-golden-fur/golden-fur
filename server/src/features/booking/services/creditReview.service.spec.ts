import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decideCreditReview,
  listPendingCreditReviews,
} from './creditReview.service.ts';
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

    for (const method of ['select', 'eq', 'neq', 'or', 'is', 'order']) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update']) {
      builder[method] = vi.fn((payload?: unknown) => {
        recordedWrites.push({ table, method, payload });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-default',
    branch_id: null,
    credit_expiry_mode: 'none',
    credit_expiry_days: 30,
    credit_expiry_fixed_date: null,
    cancellation_credit_conversion_rate: 100,
    ...overrides,
  };
}

const PENDING_LOG = {
  id: 'log-1',
  booking_id: 'booking-1',
  customer_id: 'cust-1',
  branch_id: 'branch-1',
  event_type: 'cancellation',
  credit_review_status: 'pending',
  credit_issued: false,
  credit_amount: null,
};

const BOOKING = { id: 'booking-1', cancellation_reason: 'plans changed' };

const PAID_TXNS = { data: [{ total_amount: 500 }], error: null };
const NO_TXNS = { data: [], error: null };

const ISSUED_TRANSACTION = { id: 'txn-1', amount: 500 };

describe('creditReview.service (manual-cancellation-credit-review custom change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  describe('listPendingCreditReviews', () => {
    it('returns each pending row with a computed amount_paid and potential_credit_amount', async () => {
      queueFromResults(
        { data: [{ ...PENDING_LOG, booking: BOOKING }], error: null }, // cancellation_logs select
        PAID_TXNS, // confirmedAmountPaid for the one row
        {
          data: [policyRow({ cancellation_credit_conversion_rate: 50 })],
          error: null,
        } // resolveEffectivePolicy
      );

      const result = await listPendingCreditReviews('branch-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        booking: BOOKING,
        amount_paid: 500,
        potential_credit_amount: 250,
      });
      expect(result[0].log).toMatchObject({ id: 'log-1' });
    });

    it('returns an empty list when nothing is pending', async () => {
      queueFromResults({ data: [], error: null });

      const result = await listPendingCreditReviews('branch-1');

      expect(result).toEqual([]);
    });
  });

  describe('decideCreditReview', () => {
    it('denied: marks the log denied without issuing any credit', async () => {
      queueFromResults(
        { data: PENDING_LOG, error: null }, // log fetch
        {
          data: { ...PENDING_LOG, credit_review_status: 'denied' },
          error: null,
        } // update
      );

      const result = await decideCreditReview({
        requesterId: 'staff-1',
        cancellationLogId: 'log-1',
        decision: 'denied',
      });

      expect(result.credit_review_status).toBe('denied');
      expect(supabase.rpc).not.toHaveBeenCalled();

      const update = recordedWrites.find(
        (w) => w.table === 'cancellation_logs' && w.method === 'update'
      );
      expect(update?.payload).toMatchObject({
        credit_review_status: 'denied',
        reviewed_by: 'staff-1',
      });
    });

    it('approved: issues credit at the CURRENT policy rate and marks the log approved', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: ISSUED_TRANSACTION,
        error: null,
      } as never);
      queueFromResults(
        { data: PENDING_LOG, error: null }, // log fetch
        PAID_TXNS, // confirmedAmountPaid
        {
          data: [policyRow({ cancellation_credit_conversion_rate: 50 })],
          error: null,
        }, // resolveEffectivePolicy
        {
          data: {
            ...PENDING_LOG,
            credit_review_status: 'approved',
            credit_issued: true,
            credit_amount: 250,
          },
          error: null,
        } // update
      );

      const result = await decideCreditReview({
        requesterId: 'staff-1',
        cancellationLogId: 'log-1',
        decision: 'approved',
      });

      expect(result.credit_review_status).toBe('approved');
      expect(supabase.rpc).toHaveBeenCalledWith(
        'issue_credit',
        expect.objectContaining({
          p_customer_id: 'cust-1',
          p_branch_id: 'branch-1',
          p_amount: 250,
          p_cancellation_log_id: 'log-1',
        })
      );

      const update = recordedWrites.find(
        (w) => w.table === 'cancellation_logs' && w.method === 'update'
      );
      expect(update?.payload).toMatchObject({
        credit_review_status: 'approved',
        credit_issued: true,
        credit_amount: 250,
      });
    });

    it('approved but nothing was actually paid: still marks approved, issues no credit', async () => {
      queueFromResults(
        { data: PENDING_LOG, error: null },
        NO_TXNS,
        { data: [policyRow()], error: null },
        {
          data: { ...PENDING_LOG, credit_review_status: 'approved' },
          error: null,
        }
      );

      const result = await decideCreditReview({
        requesterId: 'staff-1',
        cancellationLogId: 'log-1',
        decision: 'approved',
      });

      expect(result.credit_review_status).toBe('approved');
      expect(supabase.rpc).not.toHaveBeenCalled();

      const update = recordedWrites.find(
        (w) => w.table === 'cancellation_logs' && w.method === 'update'
      );
      expect(update?.payload).not.toHaveProperty('credit_issued');
    });

    it('throws 502 and leaves the log pending when issue_credit fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'rpc failed' },
      } as never);
      queueFromResults({ data: PENDING_LOG, error: null }, PAID_TXNS, {
        data: [policyRow()],
        error: null,
      });

      await expect(
        decideCreditReview({
          requesterId: 'staff-1',
          cancellationLogId: 'log-1',
          decision: 'approved',
        })
      ).rejects.toMatchObject({ statusCode: 502 });

      expect(
        recordedWrites.find(
          (w) => w.table === 'cancellation_logs' && w.method === 'update'
        )
      ).toBeUndefined();
    });

    it('rejects re-deciding an already-decided log', async () => {
      queueFromResults({
        data: { ...PENDING_LOG, credit_review_status: 'approved' },
        error: null,
      });

      await expect(
        decideCreditReview({
          requesterId: 'staff-1',
          cancellationLogId: 'log-1',
          decision: 'denied',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('404s on an unknown log id', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        decideCreditReview({
          requesterId: 'staff-1',
          cancellationLogId: 'missing',
          decision: 'denied',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
