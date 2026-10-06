import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postServicesDoneCharge } from './serviceCharge.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  recomputeBookingGroupPaymentStatus,
  recomputeBookingPaymentStatus,
} from '../../booking/services/booking.service.ts';
import type { Consultation } from '../veterinary.types.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../booking/services/booking.service.ts', () => ({
  recomputeBookingPaymentStatus: vi.fn(() => Promise.resolve({})),
  recomputeBookingGroupPaymentStatus: vi.fn(() => Promise.resolve({})),
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

    for (const method of ['select', 'eq', 'in']) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update', 'delete']) {
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

const VET_ID = 'vet-1';

// A free Follow-up Consultation: nothing was owed until the vet says what
// was done.
const BOOKING = {
  id: 'booking-1',
  customer_id: 'customer-1',
  branch_id: 'branch-makati',
  total_price: 0,
  booking_group_id: null,
};

const CONSULTATION = {
  id: 'consultation-1',
  booking_id: 'booking-1',
} as Consultation;

const SERVICES_DONE = [
  { name: 'Surgery', amount: 10000 },
  { name: 'Wound dressing', amount: 350.5 },
];

const writesTo = (table: string) =>
  recordedWrites.filter((write) => write.table === table);

describe('serviceCharge.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  it('bills the services done as one unpaid transaction, a line per service, and raises the booking total to match', async () => {
    queueFromResults(
      { data: BOOKING, error: null }, // bookings lookup
      { data: { id: 'txn-new' }, error: null }, // transactions insert
      { data: null, error: null }, // transaction_line_items insert
      { data: null, error: null } // bookings total
    );

    await postServicesDoneCharge({
      consultation: CONSULTATION,
      lines: SERVICES_DONE,
      requesterId: VET_ID,
    });

    expect(writesTo('transactions')).toEqual([
      {
        table: 'transactions',
        method: 'insert',
        payload: expect.objectContaining({
          booking_id: 'booking-1',
          booking_group_id: null,
          customer_id: 'customer-1',
          branch_id: 'branch-makati',
          transaction_type: 'booking_payment',
          payment_status: 'Pending',
          payment_choice: 'balance',
          subtotal_amount: 10350.5,
          total_amount: 10350.5,
          processed_by_staff_id: VET_ID,
        }),
      },
    ]);
    expect(writesTo('transaction_line_items')[0].payload).toEqual([
      {
        transaction_id: 'txn-new',
        line_item_type: 'service',
        reference_id: 'consultation-1',
        description: 'Surgery',
        quantity: 1,
        unit_price: 10000,
        line_total: 10000,
      },
      {
        transaction_id: 'txn-new',
        line_item_type: 'service',
        reference_id: 'consultation-1',
        description: 'Wound dressing',
        quantity: 1,
        unit_price: 350.5,
        line_total: 350.5,
      },
    ]);
    expect(writesTo('bookings')[0].payload).toMatchObject({
      total_price: 10350.5,
    });
    expect(recomputeBookingPaymentStatus).toHaveBeenCalledWith('booking-1');
  });

  it('adds to what was already booked rather than replacing it', async () => {
    queueFromResults(
      { data: { ...BOOKING, total_price: 700 }, error: null }, // bookings lookup
      { data: { id: 'txn-new' }, error: null }, // transactions insert
      { data: null, error: null }, // transaction_line_items insert
      { data: null, error: null } // bookings total
    );

    await postServicesDoneCharge({
      consultation: CONSULTATION,
      lines: [{ name: 'Surgery', amount: 10000 }],
      requesterId: VET_ID,
    });

    expect(writesTo('bookings')[0].payload).toMatchObject({
      total_price: 10700,
    });
  });

  it('writes nothing when no service was listed', async () => {
    await postServicesDoneCharge({
      consultation: CONSULTATION,
      lines: [],
      requesterId: VET_ID,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not post a zero-peso transaction when every listed service was free', async () => {
    await postServicesDoneCharge({
      consultation: CONSULTATION,
      lines: [{ name: 'Suture check', amount: 0 }],
      requesterId: VET_ID,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("bills a grouped booking's services to the group, like its other charges", async () => {
    queueFromResults(
      { data: { ...BOOKING, booking_group_id: 'group-1' }, error: null }, // bookings lookup
      { data: { id: 'txn-new' }, error: null }, // transactions insert
      { data: null, error: null }, // transaction_line_items insert
      { data: null, error: null }, // bookings total
      { data: { net_total: 1500 }, error: null }, // booking_groups lookup
      { data: null, error: null } // booking_groups total
    );

    await postServicesDoneCharge({
      consultation: CONSULTATION,
      lines: [{ name: 'Surgery', amount: 10000 }],
      requesterId: VET_ID,
    });

    expect(writesTo('transactions')[0].payload).toMatchObject({
      booking_id: null,
      booking_group_id: 'group-1',
    });
    expect(writesTo('booking_groups')[0].payload).toMatchObject({
      net_total: 11500,
    });
    expect(recomputeBookingGroupPaymentStatus).toHaveBeenCalledWith('group-1');
  });
});
