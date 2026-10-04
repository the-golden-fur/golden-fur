import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postDaycareOverdueCharge } from './daycareOverdueCharge.service.ts';
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

    for (const method of [
      'select',
      'eq',
      'order',
      'limit',
      'update',
      'insert',
    ]) {
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
  total_price: 150,
  booking_group_id: null,
};

const OK = { data: null, error: null };

describe('postDaycareOverdueCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('creates a new Pending balance charge for the fee when the booking is already paid up', async () => {
    queueFromResults(
      { data: BOOKING, error: null }, // booking lookup
      OK, // bookings.total_price update
      { data: null, error: null }, // no open Pending balance transaction
      { data: { id: 'txn-new', total_amount: 100 }, error: null }, // insert
      OK // line item insert
    );

    const transaction = await postDaycareOverdueCharge({
      bookingId: 'booking-1',
      overdueHours: 2,
      overdueFee: 100,
      requesterId: 'staff-1',
    });

    expect(transaction.id).toBe('txn-new');
    // What the booking is paid up against grows by the fee.
    expect(written('bookings', 'update')[0]).toMatchObject({
      total_price: 250,
    });
    expect(written('transactions', 'insert')[0]).toMatchObject({
      booking_id: 'booking-1',
      booking_group_id: null,
      customer_id: 'customer-1',
      branch_id: 'branch-1',
      transaction_type: 'booking_payment',
      payment_status: 'Pending',
      payment_choice: 'balance',
      subtotal_amount: 100,
      total_amount: 100,
      processed_by_staff_id: 'staff-1',
    });
    expect(written('transaction_line_items', 'insert')[0]).toMatchObject({
      transaction_id: 'txn-new',
      description: 'Daycare overdue checkout fee (2 hours x ₱50)',
      quantity: 2,
      unit_price: 50,
      line_total: 100,
    });
    expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
  });

  it('adds the fee to the open Pending balance charge instead of creating a second one', async () => {
    queueFromResults(
      { data: BOOKING, error: null },
      OK,
      {
        data: { id: 'txn-balance', subtotal_amount: 75, total_amount: 75 },
        error: null,
      }, // the open 'balance' row
      { data: { id: 'txn-balance', total_amount: 125 }, error: null }, // update
      OK
    );

    const transaction = await postDaycareOverdueCharge({
      bookingId: 'booking-1',
      overdueHours: 1,
      overdueFee: 50,
    });

    expect(transaction.id).toBe('txn-balance');
    expect(written('transactions', 'insert')).toHaveLength(0);
    expect(written('transactions', 'update')[0]).toMatchObject({
      subtotal_amount: 125,
      total_amount: 125,
    });
    expect(written('transaction_line_items', 'insert')[0]).toMatchObject({
      transaction_id: 'txn-balance',
      description: 'Daycare overdue checkout fee (1 hour x ₱50)',
      line_total: 50,
    });
  });

  it("puts a grouped booking's fee on the booking group, where its transactions live", async () => {
    queueFromResults(
      { data: { ...BOOKING, booking_group_id: 'group-1' }, error: null },
      OK, // bookings.total_price update
      { data: { net_total: 400 }, error: null }, // group lookup
      OK, // group net_total update
      { data: null, error: null }, // no open balance on the group
      { data: { id: 'txn-group', total_amount: 50 }, error: null },
      OK
    );

    await postDaycareOverdueCharge({
      bookingId: 'booking-1',
      overdueHours: 1,
      overdueFee: 50,
    });

    expect(written('booking_groups', 'update')[0]).toMatchObject({
      net_total: 450,
    });
    expect(written('transactions', 'insert')[0]).toMatchObject({
      booking_id: null,
      booking_group_id: 'group-1',
    });
    expect(calls).toContainEqual({
      table: 'transactions',
      method: 'eq',
      args: ['booking_group_id', 'group-1'],
    });
    expect(recomputeBookingGroupPaymentStatus).toHaveBeenCalledWith('group-1');
    expect(recomputeBookingPaymentStatus).not.toHaveBeenCalled();
  });

  it('still returns the saved charge when the payment-status roll-up fails', async () => {
    vi.mocked(recomputeBookingPaymentStatus).mockRejectedValueOnce(
      new Error('boom')
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    queueFromResults(
      { data: BOOKING, error: null },
      OK,
      { data: null, error: null },
      { data: { id: 'txn-new', total_amount: 50 }, error: null },
      OK
    );

    await expect(
      postDaycareOverdueCharge({
        bookingId: 'booking-1',
        overdueHours: 1,
        overdueFee: 50,
      })
    ).resolves.toMatchObject({ id: 'txn-new' });

    consoleError.mockRestore();
  });

  it('rejects when the booking does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      postDaycareOverdueCharge({
        bookingId: 'missing',
        overdueHours: 1,
        overdueFee: 50,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
