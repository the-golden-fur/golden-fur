import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extendHotelStay } from './extendStay.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { checkCapacity } from './capacity.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('./capacity.service.ts', () => ({
  checkCapacity: vi.fn(),
}));

// recomputeBookingPaymentStatus does its own separate Supabase reads/writes
// (covered by booking.service.spec.ts) - stubbed here so this file's
// sequential mock queues only need to account for extendHotelStay's own
// queries, not that function's too. round2 is kept real (a pure function),
// via importOriginal.
vi.mock('./booking.service.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./booking.service.ts')>();
  return {
    ...actual,
    recomputeBookingPaymentStatus: vi.fn(),
  };
});

import { recomputeBookingPaymentStatus } from './booking.service.ts';

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

    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }

    for (const method of ['insert', 'update']) {
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

const BOOKING = {
  id: 'booking-1',
  customer_id: 'cust-1',
  branch_id: 'branch-1',
  pet_id: 'pet-1',
  service_category: 'Hotel',
  status: 'In Progress',
  booking_group_id: null,
  scheduled_start: '2026-08-01T00:00:00.000Z',
  scheduled_end: '2026-08-03T00:00:00.000Z', // 2 nights
  total_price: 2000,
};

const ITEM = {
  id: 'item-1',
  booking_id: 'booking-1',
  service_id: 'service-hotel',
  package_id: null,
  price_at_booking: 2000,
  duration_minutes_at_booking: 1440,
};

const PET = { weight_class: 'M' };

const UPDATED_BOOKING = { ...BOOKING, payment_status: 'Partially Paid' };

describe('extendHotelStay (extend-hotel-stay custom change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
    vi.mocked(checkCapacity).mockResolvedValue({
      available: true,
      eligibleStaff: [],
    } as never);
    vi.mocked(recomputeBookingPaymentStatus).mockResolvedValue(
      UPDATED_BOOKING as never
    );
  });

  it('adds nights, bumps the price proportionally, and creates a new Pending balance transaction when none is open', async () => {
    queueFromResults(
      { data: BOOKING, error: null }, // bookings select
      { data: [ITEM], error: null }, // booking_items select
      { data: PET, error: null }, // pets select
      { data: null, error: null }, // bookings update
      { data: null, error: null }, // booking_items update
      { data: null, error: null }, // stays select - not checked in
      { data: null, error: null }, // transactions select - no open balance
      {
        data: { id: 'txn-new', total_amount: 1000, subtotal_amount: 1000 },
        error: null,
      }, // transactions insert
      { data: null, error: null } // transaction_line_items insert
    );

    const result = await extendHotelStay({
      requesterId: 'staff-1',
      bookingId: 'booking-1',
      additionalNights: 1,
    });

    expect(result.added_amount).toBe(1000); // 2000/2 nights = 1000/night
    expect(result.transaction).toMatchObject({ id: 'txn-new' });
    expect(result.booking).toEqual(UPDATED_BOOKING);

    const bookingUpdate = recordedWrites.find(
      (w) => w.table === 'bookings' && w.method === 'update'
    );
    expect(bookingUpdate?.payload).toMatchObject({
      scheduled_end: '2026-08-04T00:00:00.000Z',
      total_price: 3000,
    });

    const itemUpdate = recordedWrites.find(
      (w) => w.table === 'booking_items' && w.method === 'update'
    );
    expect(itemUpdate?.payload).toMatchObject({ price_at_booking: 3000 });

    const txnInsert = recordedWrites.find(
      (w) => w.table === 'transactions' && w.method === 'insert'
    );
    expect(txnInsert?.payload).toMatchObject({
      payment_choice: 'balance',
      payment_status: 'Pending',
      total_amount: 1000,
      subtotal_amount: 1000,
    });
  });

  it('increases an already-open Pending balance transaction instead of creating a new one', async () => {
    const OPEN_BALANCE_TXN = {
      id: 'txn-balance',
      total_amount: 500,
      subtotal_amount: 500,
    };

    queueFromResults(
      { data: BOOKING, error: null },
      { data: [ITEM], error: null },
      { data: PET, error: null },
      { data: null, error: null }, // bookings update
      { data: null, error: null }, // booking_items update
      { data: null, error: null }, // stays select
      { data: OPEN_BALANCE_TXN, error: null }, // transactions select - found
      {
        data: {
          ...OPEN_BALANCE_TXN,
          total_amount: 1500,
          subtotal_amount: 1500,
        },
        error: null,
      }, // transactions update + select
      { data: null, error: null } // transaction_line_items insert
    );

    const result = await extendHotelStay({
      requesterId: 'staff-1',
      bookingId: 'booking-1',
      additionalNights: 1,
    });

    expect(result.transaction).toMatchObject({ total_amount: 1500 });

    const txnUpdate = recordedWrites.find(
      (w) => w.table === 'transactions' && w.method === 'update'
    );
    expect(txnUpdate?.payload).toMatchObject({
      total_amount: 1500,
      subtotal_amount: 1500,
    });
    expect(
      recordedWrites.find(
        (w) => w.table === 'transactions' && w.method === 'insert'
      )
    ).toBeUndefined();
  });

  it('also bumps a checked-in stay row’s scheduled_check_out_date', async () => {
    queueFromResults(
      { data: BOOKING, error: null },
      { data: [ITEM], error: null },
      { data: PET, error: null },
      { data: null, error: null }, // bookings update
      { data: null, error: null }, // booking_items update
      { data: { id: 'stay-1' }, error: null }, // stays select - checked in
      { data: null, error: null }, // stays update
      { data: null, error: null }, // transactions select
      { data: { id: 'txn-new' }, error: null }, // transactions insert
      { data: null, error: null } // transaction_line_items insert
    );

    await extendHotelStay({
      requesterId: 'staff-1',
      bookingId: 'booking-1',
      additionalNights: 1,
    });

    const stayUpdate = recordedWrites.find(
      (w) => w.table === 'stays' && w.method === 'update'
    );
    expect(stayUpdate?.payload).toMatchObject({
      scheduled_check_out_date: '2026-08-04',
    });
  });

  it('rejects a non-Hotel booking', async () => {
    queueFromResults({
      data: { ...BOOKING, service_category: 'Grooming' },
      error: null,
    });

    await expect(
      extendHotelStay({
        requesterId: 'staff-1',
        bookingId: 'booking-1',
        additionalNights: 1,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a Completed booking', async () => {
    queueFromResults({
      data: { ...BOOKING, status: 'Completed' },
      error: null,
    });

    await expect(
      extendHotelStay({
        requesterId: 'staff-1',
        bookingId: 'booking-1',
        additionalNights: 1,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a booking that belongs to a multi-booking checkout group', async () => {
    queueFromResults({
      data: { ...BOOKING, booking_group_id: 'group-1' },
      error: null,
    });

    await expect(
      extendHotelStay({
        requesterId: 'staff-1',
        bookingId: 'booking-1',
        additionalNights: 1,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when the extended window has no cage capacity', async () => {
    queueFromResults(
      { data: BOOKING, error: null },
      { data: [ITEM], error: null },
      { data: PET, error: null }
    );
    vi.mocked(checkCapacity).mockResolvedValue({
      available: false,
      reason: 'No cages available',
      eligibleStaff: [],
    } as never);

    await expect(
      extendHotelStay({
        requesterId: 'staff-1',
        bookingId: 'booking-1',
        additionalNights: 1,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
