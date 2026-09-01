import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBookingPayment,
  payTransactionWithCredit,
  recordTransactionPayment,
} from './transactionPayment.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getAvailableCredit } from './creditStub.service.ts';
import { applyFirstBookingPaymentSideEffects } from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('./creditStub.service.ts', () => ({
  getAvailableCredit: vi.fn(),
}));

// The first-payment side-effects (slot re-check + confirmation alerts) are
// booking.service's own concern, covered by its spec - stub it here so this
// spec stays a unit test of the settlement flow.
vi.mock('../../booking/services/booking.service.ts', () => ({
  applyFirstBookingPaymentSideEffects: vi
    .fn()
    .mockResolvedValue({ id: 'booking-1', payment_status: 'Fully Paid' }),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Each supabase.from() call consumes the next queued result. Call order is
 * deterministic per service function (loadTransaction, then any
 * update().eq(), then the reload). Both a terminal .maybeSingle() and a
 * bare awaited builder (update().eq()) resolve to the same queued result. */
function queueFrom(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'update']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_r: QueryResult) => unknown) => resolve(result);

    return builder;
  }) as never);
}

const PENDING_BOOKING_TXN = {
  id: 'txn-1',
  booking_id: 'booking-1',
  customer_id: 'customer-1',
  branch_id: 'branch-1',
  transaction_type: 'booking_payment',
  payment_status: 'Pending',
  total_amount: 500,
};

describe('transactionPayment.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a cash payment: settles the transaction and returns the computed change', async () => {
    queueFrom(
      { data: PENDING_BOOKING_TXN, error: null }, // loadTransaction
      { data: { payment_status: 'Pending' }, error: null }, // loadBookingPaymentStatus
      {
        data: { ...PENDING_BOOKING_TXN, payment_status: 'Fully Paid' },
        error: null,
      } // reload
    );
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { booking_id: 'booking-1', payment_status: 'Fully Paid' },
      error: null,
    } as never);

    const result = await recordTransactionPayment({
      requesterId: 'staff-1',
      transactionId: 'txn-1',
      paymentMethod: 'Cash',
      cashTendered: 600,
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'settle_transaction',
      expect.objectContaining({
        p_transaction_id: 'txn-1',
        p_payment_method: 'Cash',
        p_cash_tendered: 600,
        p_processed_by: 'staff-1',
      })
    );
    expect(result.changeAmount).toBe(100);
    expect(result.transaction.payment_status).toBe('Fully Paid');
    // The counter path must run the same first-payment side-effects (slot
    // re-check + confirmation alerts) the customer webhook path gets.
    expect(applyFirstBookingPaymentSideEffects).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      paymentStatusBeforePayment: 'Pending',
      revertOnCapacityConflict: false,
    });
  });

  it('rejects recording a payment against a miscellaneous_sale transaction', async () => {
    queueFrom({
      data: { ...PENDING_BOOKING_TXN, transaction_type: 'miscellaneous_sale' },
      error: null,
    });

    await expect(
      recordTransactionPayment({
        requesterId: 'staff-1',
        transactionId: 'txn-1',
        paymentMethod: 'Cash',
        cashTendered: 600,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects pay-with-credit against a miscellaneous_sale transaction', async () => {
    queueFrom({
      data: { ...PENDING_BOOKING_TXN, transaction_type: 'miscellaneous_sale' },
      error: null,
    });

    await expect(
      payTransactionWithCredit({
        requesterId: 'staff-1',
        transactionId: 'txn-1',
        isStaff: true,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getAvailableCredit).not.toHaveBeenCalled();
  });

  it('rejects recording a payment against an already-settled transaction', async () => {
    queueFrom({
      data: { ...PENDING_BOOKING_TXN, payment_status: 'Fully Paid' },
      error: null,
    });

    await expect(
      recordTransactionPayment({
        requesterId: 'staff-1',
        transactionId: 'txn-1',
        paymentMethod: 'Card',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('adds a balance payment via the add_booking_payment RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: 'txn-2', payment_status: 'Pending', total_amount: 300 },
      error: null,
    } as never);

    const transaction = await addBookingPayment({
      requesterId: 'staff-1',
      bookingId: 'booking-1',
      amount: 300,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('add_booking_payment', {
      p_booking_id: 'booking-1',
      p_amount: 300,
      p_processed_by: 'staff-1',
    });
    expect(transaction.payment_status).toBe('Pending');
  });

  it('pays a transaction fully from credit: redeems, settles as Credit, stamps credit_applied_amount', async () => {
    queueFrom(
      { data: PENDING_BOOKING_TXN, error: null }, // loadTransaction
      { data: { payment_status: 'Pending' }, error: null }, // loadBookingPaymentStatus
      { data: null, error: null }, // update({ credit_applied_amount }).eq()
      {
        data: {
          ...PENDING_BOOKING_TXN,
          payment_status: 'Fully Paid',
          credit_applied_amount: 500,
        },
        error: null,
      } // reload
    );
    vi.mocked(getAvailableCredit).mockResolvedValue(800);
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      if (fn === 'redeem_credit') {
        return Promise.resolve({
          data: { id: 'credit-txn-1', amount: -500 },
          error: null,
        });
      }
      return Promise.resolve({
        data: { booking_id: 'booking-1', payment_status: 'Fully Paid' },
        error: null,
      });
    }) as never);

    const result = await payTransactionWithCredit({
      requesterId: 'staff-1',
      transactionId: 'txn-1',
      isStaff: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('redeem_credit', {
      p_customer_id: 'customer-1',
      p_branch_id: 'branch-1',
      p_amount: 500,
      p_transaction_id: 'txn-1',
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'settle_transaction',
      expect.objectContaining({
        p_payment_method: 'Credit',
        p_processed_by: 'staff-1',
      })
    );
    expect(result.creditTransaction).toEqual({
      id: 'credit-txn-1',
      amount: -500,
    });
  });

  it('rejects pay-with-credit when the customer has no credit balance', async () => {
    queueFrom({ data: PENDING_BOOKING_TXN, error: null });
    vi.mocked(getAvailableCredit).mockResolvedValue(0);

    await expect(
      payTransactionWithCredit({
        requesterId: 'customer-1',
        transactionId: 'txn-1',
        isStaff: false,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects pay-with-credit when credit does not cover the whole charge (full-cover only)', async () => {
    queueFrom({ data: PENDING_BOOKING_TXN, error: null });
    vi.mocked(getAvailableCredit).mockResolvedValue(200);

    await expect(
      payTransactionWithCredit({
        requesterId: 'customer-1',
        transactionId: 'txn-1',
        isStaff: false,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects a customer paying someone else’s transaction with 403', async () => {
    queueFrom({
      data: { ...PENDING_BOOKING_TXN, customer_id: 'someone-else' },
      error: null,
    });

    await expect(
      payTransactionWithCredit({
        requesterId: 'customer-1',
        transactionId: 'txn-1',
        isStaff: false,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(getAvailableCredit).not.toHaveBeenCalled();
  });
});
