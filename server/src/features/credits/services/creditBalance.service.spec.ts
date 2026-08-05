import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listCreditBalances,
  listCreditHistory,
} from './creditBalance.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffRoleOrNull: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'order']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const CUSTOMER_ID = 'cust-1';

describe('creditBalance.service (#90/#95)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listCreditBalances', () => {
    it('AC-3: a customer with no customer_id resolves to their own balances', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
      queueFromResults({
        data: [
          {
            id: 'bal-1',
            customer_id: CUSTOMER_ID,
            branch_id: 'branch-1',
            balance: 500,
          },
        ],
        error: null,
      });

      const result = await listCreditBalances({ requesterId: CUSTOMER_ID });

      expect(result).toHaveLength(1);
    });

    it('AC-3: a customer cannot pass a different customer_id', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);

      await expect(
        listCreditBalances({
          requesterId: CUSTOMER_ID,
          customerId: 'someone-else',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('AC-3: a non-credit-staff role (e.g. Groomer) is forbidden', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Groomer');

      await expect(
        listCreditBalances({ requesterId: 'staff-1', customerId: CUSTOMER_ID })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('AC-3: Cashier/Admin/Superadmin must provide a customer_id', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');

      await expect(
        listCreditBalances({ requesterId: 'staff-1' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-3: Cashier can view any customer', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue('Cashier');
      queueFromResults({ data: [], error: null });

      const result = await listCreditBalances({
        requesterId: 'staff-1',
        customerId: CUSTOMER_ID,
      });

      expect(result).toEqual([]);
    });
  });

  describe('listCreditHistory', () => {
    it('returns an empty list when the customer has no balance row at that branch', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
      queueFromResults({ data: null, error: null }); // balance lookup - none

      const result = await listCreditHistory({
        requesterId: CUSTOMER_ID,
        branchId: 'branch-1',
      });

      expect(result).toEqual([]);
    });

    it('returns transaction history ordered newest-first for the matched balance row', async () => {
      vi.mocked(getStaffRoleOrNull).mockResolvedValue(null);
      queueFromResults(
        { data: { id: 'bal-1' }, error: null }, // balance lookup
        { data: [{ id: 'txn-2' }, { id: 'txn-1' }], error: null } // history
      );

      const result = await listCreditHistory({
        requesterId: CUSTOMER_ID,
        branchId: 'branch-1',
      });

      expect(result).toEqual([{ id: 'txn-2' }, { id: 'txn-1' }]);
    });
  });
});
