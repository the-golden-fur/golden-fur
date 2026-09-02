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

    for (const method of ['select', 'eq', 'neq', 'update', 'limit', 'order']) {
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
      { data: [], error: null }, // pendingBalanceTxnIds (before)
      {
        data: { ...PENDING_BOOKING_TXN, payment_status: 'Fully Paid' },
        error: null,
      }, // reload
      { data: [], error: null } // loadSpawnedLeftover (none - full settle)
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
        p_amount_applied: 500,
      })
    );
    expect(result.changeAmount).toBe(100);
    expect(result.leftover).toBeNull();
    expect(result.transaction.payment_status).toBe('Fully Paid');
    // The counter path must run the same first-payment side-effects (slot
    // re-check + confirmation alerts) the customer webhook path gets.
    expect(applyFirstBookingPaymentSideEffects).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      paymentStatusBeforePayment: 'Pending',
      revertOnCapacityConflict: false,
    });
  });

  it('partial cash payment: passes amount_applied and returns the spawned leftover balance transaction', async () => {
    queueFrom(
      { data: PENDING_BOOKING_TXN, error: null }, // loadTransaction
      { data: { payment_status: 'Pending' }, error: null }, // loadBookingPaymentStatus
      { data: [], error: null }, // pendingBalanceTxnIds (before)
      {
        data: {
          ...PENDING_BOOKING_TXN,
          total_amount: 200,
          payment_status: 'Fully Paid',
        },
        error: null,
      }, // reload
      {
        data: [
          {
            id: 'txn-leftover',
            payment_status: 'Pending',
            payment_choice: 'balance',
            total_amount: 300,
          },
        ],
        error: null,
      } // loadSpawnedLeftover
    );
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { booking_id: 'booking-1', payment_status: 'Partially Paid' },
      error: null,
    } as never);

    const result = await recordTransactionPayment({
      requesterId: 'staff-1',
      transactionId: 'txn-1',
      paymentMethod: 'Cash',
      cashTendered: 200,
      amountApplied: 200,
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'settle_transaction',
      expect.objectContaining({ p_amount_applied: 200 })
    );
    // Cash tender is checked against the amount being collected (200), not 500.
    expect(result.changeAmount).toBe(0);
    expect(result.leftover).toMatchObject({
      id: 'txn-leftover',
      total_amount: 300,
    });
  });

  it('rejects an amount_applied above the transaction total', async () => {
    queueFrom({ data: PENDING_BOOKING_TXN, error: null });

    await expect(
      recordTransactionPayment({
        requesterId: 'staff-1',
        transactionId: 'txn-1',
        paymentMethod: 'Card',
        amountApplied: 999,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(supabase.rpc).not.toHaveBeenCalled();
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

  it('adds a balance payment via the add_booking_payment RPC (no app-side guard - the RPC nets Pending rows)', async () => {
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

  it('surfaces the add_booking_payment RPC error (amount over the remaining balance) as a 400', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: {
        message:
          'add_booking_payment: amount 999 exceeds remaining balance 300',
      },
    } as never);

    await expect(
      addBookingPayment({
        requesterId: 'staff-1',
        bookingId: 'booking-1',
        amount: 999,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('pays a transaction fully from credit via the atomic pay_transaction_with_credit RPC', async () => {
    queueFrom(
      { data: PENDING_BOOKING_TXN, error: null }, // loadTransaction
      { data: { payment_status: 'Pending' }, error: null }, // loadBookingPaymentStatus
      { data: [], error: null }, // pendingBalanceTxnIds (before)
      { data: { id: 'credit-txn-1', amount: -500 }, error: null }, // credit_transactions lookup
      {
        data: {
          ...PENDING_BOOKING_TXN,
          payment_status: 'Fully Paid',
          credit_applied_amount: 500,
        },
        error: null,
      }, // reload
      { data: [], error: null } // loadSpawnedLeftover (none - full cover)
    );
    vi.mocked(getAvailableCredit).mockResolvedValue(800);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: 'booking-1', payment_status: 'Fully Paid' },
      error: null,
    } as never);

    const result = await payTransactionWithCredit({
      requesterId: 'staff-1',
      transactionId: 'txn-1',
      isStaff: true,
    });

    // One atomic RPC - not a separate redeem_credit + settle_transaction.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('pay_transaction_with_credit', {
      p_transaction_id: 'txn-1',
      p_amount: 500,
      p_processed_by: 'staff-1',
    });
    expect(result.transaction.payment_status).toBe('Fully Paid');
    expect(result.leftover).toBeNull();
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

  it('partial credit: settles for the available credit and spawns a leftover balance transaction', async () => {
    queueFrom(
      { data: PENDING_BOOKING_TXN, error: null }, // loadTransaction
      { data: { payment_status: 'Pending' }, error: null }, // loadBookingPaymentStatus
      { data: [{ id: 'txn-1' }], error: null }, // pendingBalanceTxnIds (before)
      { data: { id: 'credit-txn-1', amount: -200 }, error: null }, // credit_transactions lookup
      {
        data: {
          ...PENDING_BOOKING_TXN,
          total_amount: 200,
          payment_status: 'Fully Paid',
        },
        error: null,
      }, // reload
      {
        data: [
          {
            id: 'txn-leftover',
            payment_status: 'Pending',
            payment_choice: 'balance',
            total_amount: 300,
          },
          { id: 'txn-1' },
        ],
        error: null,
      } // loadSpawnedLeftover (after)
    );
    vi.mocked(getAvailableCredit).mockResolvedValue(200);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: 'booking-1', payment_status: 'Partially Paid' },
      error: null,
    } as never);

    const result = await payTransactionWithCredit({
      requesterId: 'customer-1',
      transactionId: 'txn-1',
      isStaff: false,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('pay_transaction_with_credit', {
      p_transaction_id: 'txn-1',
      p_amount: 200,
      p_processed_by: null,
    });
    expect(result.leftover).toMatchObject({
      id: 'txn-leftover',
      total_amount: 300,
    });
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
