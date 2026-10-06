import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postPayAtCheckoutCharge } from './payAtCheckoutCharge.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  recomputeBookingGroupPaymentStatus,
  recomputeBookingPaymentStatus,
} from '../../booking/services/booking.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  recomputeBookingPaymentStatus: vi.fn().mockResolvedValue(undefined),
  recomputeBookingGroupPaymentStatus: vi.fn().mockResolvedValue(undefined),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

const calls: RecordedCall[] = [];

/** One queued result per `from()` call, in order; every builder call is
 * recorded so a test can assert what was written and how it was filtered. */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'neq', 'order', 'update', 'insert']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

function written(table: string, method: 'insert' | 'update') {
  return calls
    .filter((call) => call.table === table && call.method === method)
    .map((call) => call.args[0]);
}

const BOOKING = {
  id: 'booking-1',
  customer_id: 'customer-1',
  branch_id: 'branch-1',
  total_price: 3000,
  discount_amount: 0,
  promo_amount: 0,
  booking_group_id: null,
};

const LINE_ITEM = {
  description: 'Hotel stay (2 nights)',
  quantity: 2,
  unitPrice: 1000,
};

const OK = { data: null, error: null };
const NEW_TXN = { data: { id: 'txn-new', total_amount: 0 }, error: null };

describe('postPayAtCheckoutCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('replaces the estimate with the actual total and bills it as one Pending balance transaction', async () => {
    queueFromResults(
      { data: BOOKING, error: null },
      OK, // bookings update
      { data: [], error: null }, // nothing posted yet
      NEW_TXN,
      OK // line item
    );

    await postPayAtCheckoutCharge({
      bookingId: 'booking-1',
      actualTotal: 2000,
      lineItem: LINE_ITEM,
      requesterId: 'staff-1',
    });

    expect(written('bookings', 'update')[0]).toMatchObject({
      total_price: 2000,
    });
    expect(written('transactions', 'insert')[0]).toMatchObject({
      booking_id: 'booking-1',
      booking_group_id: null,
      transaction_type: 'booking_payment',
      payment_status: 'Pending',
      payment_choice: 'balance',
      subtotal_amount: 2000,
      total_amount: 2000,
      processed_by_staff_id: 'staff-1',
    });
    expect(written('transaction_line_items', 'insert')[0]).toMatchObject({
      transaction_id: 'txn-new',
      description: 'Hotel stay (2 nights)',
      quantity: 2,
      unit_price: 1000,
      line_total: 2000,
    });
    expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
  });

  it("takes the booking's discount and promo off the bill", async () => {
    queueFromResults(
      {
        data: { ...BOOKING, discount_amount: 300, promo_amount: 200 },
        error: null,
      },
      OK,
      { data: [], error: null },
      NEW_TXN,
      OK
    );

    await postPayAtCheckoutCharge({
      bookingId: 'booking-1',
      actualTotal: 2000,
      lineItem: LINE_ITEM,
    });

    expect(written('transactions', 'insert')[0]).toMatchObject({
      total_amount: 1500,
    });
  });

  it('bills only what is not already on the booking (e.g. a mid-stay extension charge)', async () => {
    queueFromResults(
      { data: BOOKING, error: null },
      OK,
      {
        data: [
          {
            id: 'txn-paid',
            total_amount: 500,
            subtotal_amount: 500,
            payment_status: 'Fully Paid',
            payment_choice: 'balance',
          },
        ],
        error: null,
      },
      NEW_TXN,
      OK
    );

    await postPayAtCheckoutCharge({
      bookingId: 'booking-1',
      actualTotal: 2000,
      lineItem: LINE_ITEM,
    });

    expect(written('transactions', 'insert')[0]).toMatchObject({
      total_amount: 1500,
    });
  });

  it('adds to an open Pending balance transaction instead of creating a second one', async () => {
    queueFromResults(
      { data: BOOKING, error: null },
      OK,
      {
        data: [
          {
            id: 'txn-open',
            total_amount: 500,
            subtotal_amount: 500,
            payment_status: 'Pending',
            payment_choice: 'balance',
          },
        ],
        error: null,
      },
      { data: { id: 'txn-open', total_amount: 2000 }, error: null },
      OK
    );

    await postPayAtCheckoutCharge({
      bookingId: 'booking-1',
      actualTotal: 2000,
      lineItem: LINE_ITEM,
    });

    expect(written('transactions', 'insert')).toHaveLength(0);
    expect(written('transactions', 'update')[0]).toMatchObject({
      subtotal_amount: 2000,
      total_amount: 2000,
    });
    expect(written('transaction_line_items', 'insert')[0]).toMatchObject({
      transaction_id: 'txn-open',
      line_total: 1500,
    });
  });

  it('creates no transaction and marks the booking Fully Paid when the discount covers the whole stay', async () => {
    queueFromResults(
      { data: { ...BOOKING, discount_amount: 2500 }, error: null },
      OK,
      { data: [], error: null },
      OK // bookings update -> Fully Paid
    );

    const result = await postPayAtCheckoutCharge({
      bookingId: 'booking-1',
      actualTotal: 2000,
      lineItem: LINE_ITEM,
    });

    expect(result).toBeNull();
    expect(written('transactions', 'insert')).toHaveLength(0);
    expect(written('bookings', 'update')[1]).toMatchObject({
      payment_status: 'Fully Paid',
    });
  });

  it("posts a grouped booking's bill to its booking group, counting only members already checked out", async () => {
    queueFromResults(
      {
        data: { ...BOOKING, total_price: 1000, booking_group_id: 'group-1' },
        error: null,
      },
      OK, // bookings update
      {
        data: { net_total: 1700, discount_amount: 300, promo_amount: 0 },
        error: null,
      },
      OK, // booking_groups update
      // The other member already checked out at 1200 and was billed 900.
      { data: [{ total_price: 1200 }], error: null },
      {
        data: [
          {
            id: 'txn-a',
            total_amount: 900,
            subtotal_amount: 900,
            payment_status: 'Fully Paid',
            payment_choice: 'balance',
          },
        ],
        error: null,
      },
      NEW_TXN,
      OK
    );

    await postPayAtCheckoutCharge({
      bookingId: 'booking-1',
      actualTotal: 800,
      lineItem: LINE_ITEM,
    });

    // net_total moves by the member's own difference (800 - 1000).
    expect(written('booking_groups', 'update')[0]).toMatchObject({
      net_total: 1500,
    });
    // (1200 + 800) - 300 discount - 900 already billed = 800.
    expect(written('transactions', 'insert')[0]).toMatchObject({
      booking_id: null,
      booking_group_id: 'group-1',
      total_amount: 800,
    });
    expect(recomputeBookingGroupPaymentStatus).toHaveBeenCalledWith('group-1');
    expect(recomputeBookingPaymentStatus).not.toHaveBeenCalled();
  });

  it('throws 404 when the booking does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      postPayAtCheckoutCharge({
        bookingId: 'missing',
        actualTotal: 100,
        lineItem: LINE_ITEM,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
