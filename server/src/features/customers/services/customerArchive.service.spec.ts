import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateCustomer,
  anonymizeCustomer,
  deactivateCustomer,
  deleteOrAnonymizeCustomer,
  getCustomerAutoDeletePolicyDays,
} from './customerArchive.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { deleteAuthUser } from '../../../shared/auth/api/supabaseAuth.api.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  deleteAuthUser: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

function customerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'customer-1',
    account_email: 'jane@example.com',
    full_name: 'Jane Dela Cruz',
    is_active: true,
    archived_at: null,
    deactivated_at: null,
    anonymized_at: null,
    ...overrides,
  };
}

describe('customerArchive.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deactivateCustomer', () => {
    it('stamps deactivated_at when not already set', async () => {
      queueFromResults(
        { data: customerRow({ deactivated_at: null }), error: null },
        { data: null, error: null }, // customer_profiles update
        { data: null, error: null } // pets update
      );

      await deactivateCustomer('customer-1');

      const updateCall = vi.mocked(supabase.from).mock.results[1].value as {
        update: (input: unknown) => unknown;
      };
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: false,
          deactivated_at: expect.any(String),
        })
      );
    });

    it('preserves the original deactivated_at on a repeat call (idempotent)', async () => {
      queueFromResults(
        {
          data: customerRow({ deactivated_at: '2026-01-01T00:00:00.000Z' }),
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null }
      );

      await deactivateCustomer('customer-1');

      const updateCall = vi.mocked(supabase.from).mock.results[1].value as {
        update: (input: unknown) => unknown;
      };
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({ deactivated_at: '2026-01-01T00:00:00.000Z' })
      );
    });
  });

  describe('activateCustomer', () => {
    it('clears deactivated_at', async () => {
      queueFromResults(
        { data: customerRow({ is_active: false }), error: null },
        { data: null, error: null }
      );

      await activateCustomer('customer-1');

      const updateCall = vi.mocked(supabase.from).mock.results[1].value as {
        update: (input: unknown) => unknown;
      };
      expect(updateCall.update).toHaveBeenCalledWith({
        is_active: true,
        deactivated_at: null,
      });
    });

    it('refuses to reactivate an anonymized account (410)', async () => {
      queueFromResults({
        data: customerRow({ anonymized_at: '2026-01-01T00:00:00.000Z' }),
        error: null,
      });

      await expect(activateCustomer('customer-1')).rejects.toMatchObject({
        statusCode: 410,
      });
    });
  });

  describe('anonymizeCustomer', () => {
    it('scrubs personal information and stamps anonymized_at', async () => {
      queueFromResults({ data: null, error: null });

      await anonymizeCustomer('customer-1');

      const updateCall = vi.mocked(supabase.from).mock.results[0].value as {
        update: (input: unknown) => unknown;
      };
      expect(updateCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Deleted Customer',
          contact_number: null,
          emergency_contact_name: null,
          emergency_contact_number: null,
          facebook_id: null,
          account_email: 'deleted-customer-1@deleted.goldenfur.internal',
          anonymized_at: expect.any(String),
        })
      );
    });
  });

  describe('deleteOrAnonymizeCustomer', () => {
    it('hard-deletes a customer with no booking/transaction/credit history', async () => {
      queueFromResults(
        // getCustomerOrThrow - already deactivated + archived, so
        // deactivateCustomer/archiveCustomer are skipped entirely.
        {
          data: customerRow({
            is_active: false,
            archived_at: '2026-01-01T00:00:00.000Z',
          }),
          error: null,
        },
        { data: null, error: null } // customer_profiles delete succeeds
      );

      const outcome = await deleteOrAnonymizeCustomer('customer-1');

      expect(outcome).toBe('deleted');
      expect(deleteAuthUser).toHaveBeenCalledWith('customer-1');
    });

    it('anonymizes instead when the hard delete hits a foreign-key violation', async () => {
      queueFromResults(
        {
          data: customerRow({
            is_active: false,
            archived_at: '2026-01-01T00:00:00.000Z',
          }),
          error: null,
        },
        { data: null, error: { code: '23503', message: 'FK violation' } }, // delete fails
        { data: null, error: null } // anonymizeCustomer's update
      );

      const outcome = await deleteOrAnonymizeCustomer('customer-1');

      expect(outcome).toBe('anonymized');
      expect(deleteAuthUser).not.toHaveBeenCalled();
    });

    it('propagates a non-foreign-key delete error instead of anonymizing', async () => {
      queueFromResults(
        {
          data: customerRow({
            is_active: false,
            archived_at: '2026-01-01T00:00:00.000Z',
          }),
          error: null,
        },
        { data: null, error: { code: '23505', message: 'unexpected' } }
      );

      await expect(deleteOrAnonymizeCustomer('customer-1')).rejects.toThrow(
        'unexpected'
      );
      expect(deleteAuthUser).not.toHaveBeenCalled();
    });

    it('deactivates and archives first when the customer is still fully active', async () => {
      queueFromResults(
        { data: customerRow(), error: null }, // getCustomerOrThrow (top-level)
        { data: customerRow(), error: null }, // deactivateCustomer's own getCustomerOrThrow
        { data: null, error: null }, // customer_profiles is_active update
        { data: null, error: null }, // pets is_active update
        {
          data: customerRow({ is_active: false }),
          error: null,
        }, // archiveCustomer's own getCustomerOrThrow
        { data: null, error: null }, // customer_profiles archived_at update
        { data: null, error: null }, // pets archived_at update
        { data: null, error: null } // customer_profiles delete succeeds
      );

      const outcome = await deleteOrAnonymizeCustomer('customer-1');

      expect(outcome).toBe('deleted');
    });
  });

  describe('getCustomerAutoDeletePolicyDays', () => {
    it('returns the system-default row value', async () => {
      queueFromResults({
        data: { customer_deactivation_auto_delete_days: 45 },
        error: null,
      });

      await expect(getCustomerAutoDeletePolicyDays()).resolves.toBe(45);
    });

    it('falls back to the documented default if the row is missing', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getCustomerAutoDeletePolicyDays()).resolves.toBe(30);
    });
  });
});
