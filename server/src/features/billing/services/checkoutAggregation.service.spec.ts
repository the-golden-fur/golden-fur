import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutBooking } from './checkoutAggregation.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  getBookingForBilling,
  getServiceLineItems,
} from './lineItemSources.service.ts';
import {
  evaluateDiscounts,
  evaluatePromos,
} from './discountPromoEvaluation.service.ts';
import { applyCredit, getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import { recomputeBookingPaymentStatus } from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('./lineItemSources.service.ts', () => ({
  getBookingForBilling: vi.fn(),
  getServiceLineItems: vi.fn(),
}));
vi.mock('./discountPromoEvaluation.service.ts', () => ({
  evaluateDiscounts: vi.fn(),
  evaluatePromos: vi.fn(),
}));
vi.mock('./creditStub.service.ts', () => ({
  applyCredit: vi.fn(),
  getAvailableCredit: vi.fn(),
}));
vi.mock('./paymentMethod.service.ts', () => ({
  resolvePaymentConfirmation: vi.fn(),
}));
vi.mock('./paymongo.service.ts', () => ({ initiatePaymongoPayment: vi.fn() }));
vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));
vi.mock('../../../shared/email/paymentConfirmedEmail.ts', () => ({
  sendPaymentConfirmedEmail: vi.fn(),
}));
vi.mock('../../booking/services/booking.service.ts', () => ({
  recomputeBookingPaymentStatus: vi.fn().mockResolvedValue(undefined),
}));

const BOOKING = {
  id: 'booking-1',
  customer_id: 'customer-1',
  branch_id: 'branch-1',
  branchName: 'Makati',
  service_category: 'Grooming' as const,
  items: [],
  status: 'Completed',
  total_price: 500,
  downpayment_required: false,
  downpayment_amount: null,
  payment_method: null,
  selected_discount_id: null,
  selected_discount_name: null,
  discount_amount: 0,
  selected_promo_id: null,
  selected_promo_name: null,
  promo_amount: 0,
};

const INPUT = {
  booking_id: 'booking-1',
  payment_method: 'Cash' as const,
  cash_tendered: 500,
  credit_to_apply: 0,
  senior_citizen_eligible: false,
  pwd_eligible: false,
};

/** Records every from(table) call with its terminal write, and resolves reads
 * from a per-table queue. The one read checkoutBooking does before writing is
 * the existing-transactions lookup (`select('id, payment_status').eq(...)`,
 * awaited, not `.maybeSingle()`). */
function mockSupabase(existingTransactions: unknown[]) {
  const calls: Array<{ table: string; op: string; arg?: unknown }> = [];
  let transactionsRead = false;

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.in = vi.fn(chain);
    builder.delete = vi.fn(() => {
      calls.push({ table, op: 'delete' });
      return builder;
    });
    builder.insert = vi.fn((arg: unknown) => {
      calls.push({ table, op: 'insert', arg });
      return builder;
    });
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { id: `${table}-row`, payment_status: 'Fully Paid' },
        error: null,
      })
    );
    // Awaited-without-maybeSingle: the existing-transactions read, and the
    // line-items insert's .select().
    builder.then = (resolve: (_r: unknown) => unknown) => {
      if (table === 'transactions' && !transactionsRead) {
        transactionsRead = true;
        return resolve({ data: existingTransactions, error: null });
      }
      return resolve({ data: [], error: null });
    };

    return builder;
  }) as never);

  return calls;
}

describe('checkoutBooking — initial-charge reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBookingForBilling).mockResolvedValue(BOOKING as never);
    vi.mocked(getServiceLineItems).mockResolvedValue([
      {
        line_item_type: 'service',
        reference_id: 'svc-1',
        description: 'Bath',
        quantity: 1,
        unit_price: 500,
        line_total: 500,
      },
    ] as never);
    vi.mocked(evaluateDiscounts).mockResolvedValue([]);
    vi.mocked(evaluatePromos).mockResolvedValue([]);
    vi.mocked(getAvailableCredit).mockResolvedValue(0);
    vi.mocked(applyCredit).mockResolvedValue({ appliedAmount: 0 } as never);
    vi.mocked(resolvePaymentConfirmation).mockReturnValue({
      paymentStatus: 'Fully Paid',
      changeAmount: 0,
    } as never);
  });

  it('supersedes a still-Pending booking-time estimate charge instead of 409ing', async () => {
    const calls = mockSupabase([
      { id: 'txn-estimate', payment_status: 'Pending' },
    ]);

    await checkoutBooking('staff-1', INPUT as never);

    // The estimate + its line items are deleted, then checkout writes its own.
    expect(calls.filter((c) => c.op === 'delete').map((c) => c.table)).toEqual(
      expect.arrayContaining(['transaction_line_items', 'transactions'])
    );
    expect(
      calls.some((c) => c.table === 'transactions' && c.op === 'insert')
    ).toBe(true);
    expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
  });

  it('still 409s when a real (settled) payment record exists', async () => {
    mockSupabase([{ id: 'txn-paid', payment_status: 'Fully Paid' }]);

    await expect(
      checkoutBooking('staff-1', INPUT as never)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(recomputeBookingPaymentStatus).not.toHaveBeenCalled();
  });

  it('rolls the booking payment_status up from the checkout transaction', async () => {
    mockSupabase([]);

    await checkoutBooking('staff-1', INPUT as never);

    expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
  });
});
