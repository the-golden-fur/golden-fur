import { beforeEach, describe, expect, it, vi } from 'vitest';
import { payForBooking } from './customerBookingPayment.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getBookingById } from '../../booking/services/booking.service.ts';
import { isOnlinePaymentsEnabled } from '../../booking/services/staffPicker.service.ts';
import { initiatePaymongoPayment } from './paymongo.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  getBookingById: vi.fn(),
}));

vi.mock('../../booking/services/staffPicker.service.ts', () => ({
  isOnlinePaymentsEnabled: vi.fn(),
}));

vi.mock('./paymongo.service.ts', () => ({
  initiatePaymongoPayment: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Each `supabase.from()` call shifts the next queued result. The builder
 * resolves the same result whether the caller ends with `.maybeSingle()` or
 * just awaits the chain (settled-sum read). Call order in payForBooking:
 * (1) settled-sum read, (2) pending-charge lookup, (3) update|insert. */
function queueFrom(...results: QueryResult[]) {
  const queue = [...results];
  const recorded: Array<{ method: string; payload: unknown }> = [];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'neq', 'limit', 'order']) {
      builder[method] = vi.fn(() => builder);
    }
    for (const method of ['insert', 'update']) {
      builder[method] = vi.fn((payload: unknown) => {
        recorded.push({ method, payload });
        return builder;
      });
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_r: QueryResult) => unknown) => resolve(result);

    return builder;
  }) as never);

  return recorded;
}

const CUSTOMER_ID = 'customer-1';

const UNPAID_BOOKING = {
  id: 'booking-1',
  customer_id: CUSTOMER_ID,
  branch_id: 'branch-1',
  payment_status: 'Pending',
  total_price: 1000,
  discount_amount: 0,
  promo_amount: 0,
  downpayment_required: true,
  downpayment_amount: 500,
};

describe('customerBookingPayment.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOnlinePaymentsEnabled).mockResolvedValue(true);
    vi.mocked(initiatePaymongoPayment).mockResolvedValue({
      sourceId: 'src_123',
      checkoutUrl: 'https://paymongo.test/checkout/src_123',
    });
  });

  it('rejects a caller who is not the booking owner', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      customer_id: 'someone-else',
    } as never);

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects paying an already fully-paid booking', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      payment_status: 'Fully Paid',
    } as never);

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a downpayment choice when the booking does not require one', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      downpayment_required: false,
      downpayment_amount: null,
    } as never);
    queueFrom({ data: [], error: null }); // settled-sum read

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: false,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when online payments are disabled for the branch', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    vi.mocked(isOnlinePaymentsEnabled).mockResolvedValue(false);
    queueFrom({ data: [], error: null });

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(initiatePaymongoPayment).not.toHaveBeenCalled();
  });

  it('surfaces a PayMongo failure as a 502 with a friendly message', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    vi.mocked(initiatePaymongoPayment).mockRejectedValue(new Error('boom'));
    queueFrom({ data: [], error: null }); // settled-sum read

    await expect(
      payForBooking({
        requesterId: CUSTOMER_ID,
        bookingId: 'booking-1',
        paymentMethod: 'GCash',
        payInFull: true,
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('unavailable'),
    });
  });

  it('settles the existing Pending charge (not a second insert) for a full payment', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    const recorded = queueFrom(
      { data: [], error: null }, // settled-sum read
      { data: { id: 'txn-initial' }, error: null }, // pending-charge lookup
      { data: { id: 'txn-initial', total_amount: 1000 }, error: null } // update
    );

    const result = await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'GCash',
      payInFull: true,
    });

    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, paymentMethod: 'GCash' })
    );
    // No second charge row - the initial Pending charge is updated in place.
    expect(recorded.some((r) => r.method === 'insert')).toBe(false);
    const update = recorded.find((r) => r.method === 'update');
    expect(update?.payload).toMatchObject({
      initiated_by: 'customer',
      payment_choice: 'full',
      total_amount: 1000,
      payment_reference: 'src_123',
    });
    expect(result.checkoutUrl).toBe('https://paymongo.test/checkout/src_123');
  });

  it('inserts a fresh charge when there is no outstanding Pending row (balance payment)', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      payment_status: 'Partially Paid',
    } as never);
    const recorded = queueFrom(
      { data: [{ total_amount: 500 }], error: null }, // settled-sum read (downpayment already in)
      { data: null, error: null }, // no pending charge
      { data: { id: 'txn-balance', total_amount: 500 }, error: null } // insert
    );

    await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'GCash',
      payInFull: true,
    });

    // net 1000 - 500 settled = 500 remaining
    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500 })
    );
    expect(recorded.some((r) => r.method === 'insert')).toBe(true);
  });

  it('pays only the downpayment_amount when payInFull is false and a downpayment is required', async () => {
    vi.mocked(getBookingById).mockResolvedValue(UNPAID_BOOKING as never);
    queueFrom(
      { data: [], error: null },
      { data: { id: 'txn-initial' }, error: null },
      { data: { id: 'txn-initial', total_amount: 500 }, error: null }
    );

    await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'Maya',
      payInFull: false,
    });

    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500, paymentMethod: 'Maya' })
    );
  });

  it('bills net of a booking-time discount, not the gross total_price', async () => {
    vi.mocked(getBookingById).mockResolvedValue({
      ...UNPAID_BOOKING,
      discount_amount: 200,
      promo_amount: 50,
    } as never);
    queueFrom(
      { data: [], error: null },
      { data: { id: 'txn-initial' }, error: null },
      { data: { id: 'txn-initial', total_amount: 750 }, error: null }
    );

    await payForBooking({
      requesterId: CUSTOMER_ID,
      bookingId: 'booking-1',
      paymentMethod: 'GCash',
      payInFull: true,
    });

    // 1000 - 200 - 50 = 750
    expect(initiatePaymongoPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 750 })
    );
  });
});
