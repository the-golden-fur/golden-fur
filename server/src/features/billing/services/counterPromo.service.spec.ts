import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getStaffBranch } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  assertMinimumPayable,
  resolvePromoAmount,
} from '../../booking/services/booking.service.ts';
import { getPromoById } from '../../maintenance/services/promos.service.ts';
import {
  listCounterPromoOptions,
  withCounterPromo,
} from './counterPromo.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../../shared/auth/api/supabaseAuth.api.ts', () => ({
  getStaffBranch: vi.fn(),
}));
vi.mock('../../booking/services/booking.service.ts', () => ({
  assertMinimumPayable: vi.fn(),
  resolvePromoAmount: vi.fn(),
}));
vi.mock('../../maintenance/services/promos.service.ts', () => ({
  getPromoById: vi.fn(),
}));

const ok = (data: unknown) => ({ data, error: null });

const pendingBill = {
  id: 't-1',
  booking_id: 'b-1',
  branch_id: 'mkt',
  transaction_type: 'booking_payment',
  payment_status: 'Pending',
  payment_choice: 'full',
  total_amount: 1000,
};

const booking = {
  id: 'b-1',
  status: 'Pending',
  total_price: 1000,
  discount_amount: 0,
  promo_amount: 0,
  awaiting_assessment: false,
  booking_items: [{ service_id: 's-1', package_id: null }],
};

function mockTables(results: Record<string, unknown[]>) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = results[table]?.shift() ?? ok([]);
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'neq']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);

    return builder as never;
  }) as never);
}

function mockBill({
  bill = pendingBill,
  order = booking,
  selections = [],
  otherPayments = [],
  promos = [{ id: 'p-1' }],
}: {
  bill?: Partial<typeof pendingBill>;
  order?: Partial<typeof booking>;
  selections?: unknown[];
  otherPayments?: unknown[];
  promos?: unknown[];
} = {}) {
  mockTables({
    transactions: [ok({ ...pendingBill, ...bill }), ok(otherPayments)],
    bookings: [ok({ ...booking, ...order })],
    booking_promo_selections: [ok(selections)],
    promos: [ok(promos)],
  });
}

const httpError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { statusCode });

const params = { requesterId: 'cashier', transactionId: 't-1' };

describe('counter promos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStaffBranch).mockResolvedValue({
      data: { role: 'Cashier', branch_id: 'mkt' },
    } as never);
    vi.mocked(getPromoById).mockResolvedValue({
      id: 'p-1',
      name: 'Promo',
    } as never);
    vi.mocked(resolvePromoAmount).mockReturnValue(100);
    vi.mocked(assertMinimumPayable).mockImplementation(() => undefined);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: 'line-1',
      error: null,
    } as never);
  });

  describe('listCounterPromoOptions', () => {
    it('offers a promo with what it takes off', async () => {
      mockBill();

      await expect(listCounterPromoOptions(params)).resolves.toEqual({
        promos: [{ id: 'p-1', name: 'Promo', amount: 100 }],
        reason: null,
      });
      expect(resolvePromoAmount).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ branchId: 'mkt', totalPrice: 1000 })
      );
    });

    it('leaves out a promo that fails the booking rules', async () => {
      mockBill();
      vi.mocked(resolvePromoAmount).mockImplementation(() => {
        throw httpError(400, 'Not active');
      });

      await expect(listCounterPromoOptions(params)).resolves.toMatchObject({
        promos: [],
      });
    });

    it('leaves out a promo over the 50% limit', async () => {
      mockBill();
      vi.mocked(assertMinimumPayable).mockImplementation(() => {
        throw httpError(400, 'Too much');
      });

      await expect(listCounterPromoOptions(params)).resolves.toMatchObject({
        promos: [],
      });
    });

    it('leaves out a promo that would clear the whole bill', async () => {
      mockBill({ bill: { total_amount: 100 } });

      await expect(listCounterPromoOptions(params)).resolves.toMatchObject({
        promos: [],
      });
    });

    it.each([
      ['a group bill', { bill: { booking_id: null as never } }],
      ['a paid bill', { bill: { payment_status: 'Fully Paid' } }],
      ['a down payment', { bill: { payment_choice: 'downpayment' } }],
      ['a balance', { bill: { payment_choice: 'balance' } }],
      ['a cancelled booking', { order: { status: 'Cancelled' } }],
      ['an unassessed booking', { order: { awaiting_assessment: true } }],
      ['an existing discount', { order: { discount_amount: 50 } }],
      ['an existing promo', { order: { promo_amount: 50 } }],
      ['a selected coupon', { selections: [{ id: 's-1' }] }],
      ['an earlier payment', { otherPayments: [{ id: 't-0' }] }],
    ])('refuses %s, with a reason', async (_label, setup) => {
      mockBill(setup);

      const result = await listCounterPromoOptions(params);

      expect(result.promos).toEqual([]);
      expect(result.reason).toEqual(expect.any(String));
    });

    it('refuses another branch', async () => {
      mockBill({ bill: { branch_id: 'southwoods' } });

      await expect(listCounterPromoOptions(params)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('lets a Superadmin look at any branch', async () => {
      mockBill({ bill: { branch_id: 'southwoods' } });
      vi.mocked(getStaffBranch).mockResolvedValue({
        data: { role: 'Superadmin', branch_id: 'mkt' },
      } as never);

      await expect(listCounterPromoOptions(params)).resolves.toBeDefined();
    });
  });

  describe('withCounterPromo', () => {
    it('just pays when no promo was picked', async () => {
      const pay = vi.fn().mockResolvedValue('paid');

      await expect(withCounterPromo(params, pay)).resolves.toBe('paid');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('applies the promo before the payment', async () => {
      mockBill();
      const pay = vi.fn(() => {
        expect(supabase.rpc).toHaveBeenCalledWith(
          'apply_promo_to_booking_payment',
          { p_transaction_id: 't-1', p_promo_id: 'p-1', p_amount: 100 }
        );
        return Promise.resolve('paid');
      });

      await expect(
        withCounterPromo({ ...params, promoId: 'p-1' }, pay)
      ).resolves.toBe('paid');
      expect(pay).toHaveBeenCalled();
    });

    it('takes the promo back off when the payment fails', async () => {
      mockBill();
      const failure = httpError(400, 'No credit');

      await expect(
        withCounterPromo({ ...params, promoId: 'p-1' }, () =>
          Promise.reject(failure)
        )
      ).rejects.toBe(failure);

      expect(supabase.rpc).toHaveBeenCalledWith(
        'remove_promo_from_booking_payment',
        {
          p_transaction_id: 't-1',
          p_promo_id: 'p-1',
          p_amount: 100,
          p_line_id: 'line-1',
        }
      );
    });

    it('never reaches the payment on a bill that cannot take a promo', async () => {
      mockBill({ order: { promo_amount: 50 } });
      const pay = vi.fn();

      await expect(
        withCounterPromo({ ...params, promoId: 'p-1' }, pay)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(pay).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('stops if the database refuses, such as a second cashier', async () => {
      mockBill();
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'This booking already has a discount or promo' },
      } as never);
      const pay = vi.fn();

      await expect(
        withCounterPromo({ ...params, promoId: 'p-1' }, pay)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(pay).not.toHaveBeenCalled();
    });
  });
});
