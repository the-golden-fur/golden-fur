import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPetServiceHistory } from './petServiceHistory.service.ts';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

vi.mock('../../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.or = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);
    builders.push(builder as Record<string, ReturnType<typeof vi.fn>>);

    return builder as never;
  });

  return builders;
}

const COMPLETED_GROOMING = {
  id: 'booking-1',
  service_category: 'Grooming',
  status: 'Completed',
  scheduled_start: '2026-10-01T02:00:00.000Z',
  completed_at: '2026-10-01T04:30:00.000Z',
  booking_group_id: null,
  total_price: '850.00',
  cancellation_reason: null,
  branches: { name: 'Main Branch' },
  assigned_staff: { display_name: 'Ana Groomer' },
  booking_items: [
    { services: { name: 'Full Groom' }, packages: null },
    { services: null, packages: { name: 'Spa Package' } },
  ],
};

const CANCELLED_HOTEL = {
  id: 'booking-2',
  service_category: 'Hotel',
  status: 'Cancelled',
  scheduled_start: '2026-09-20T06:00:00.000Z',
  completed_at: null,
  booking_group_id: null,
  total_price: 2400,
  cancellation_reason: 'Owner changed plans',
  branches: null,
  assigned_staff: null,
  booking_items: null,
};

const GROUPED_DAYCARE = {
  ...COMPLETED_GROOMING,
  id: 'booking-3',
  service_category: 'Daycare',
  booking_group_id: 'group-1',
};

function payment(overrides: Record<string, unknown>) {
  return {
    id: 'txn-1',
    booking_id: 'booking-1',
    booking_group_id: null,
    branch_id: 'branch-1',
    transaction_type: 'booking_payment',
    payment_method: 'Cash',
    payment_status: 'Fully Paid',
    payment_choice: 'full',
    total_amount: '850.00',
    misc_sale_description: null,
    created_at: '2026-10-01T05:00:00.000Z',
    bookings: { service_category: 'Grooming', pets: { name: 'Buddy' } },
    transaction_line_items: null,
    ...overrides,
  };
}

describe('petServiceHistory.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is available to the owning customer and maps each booking to a history entry', async () => {
    queueFromResults(
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [COMPLETED_GROOMING, CANCELLED_HOTEL], error: null },
      { data: [], error: null }
    );

    const result = await listPetServiceHistory({
      requesterId: 'customer-1',
      petId: 'pet-1',
    });

    expect(result).toEqual([
      {
        booking_id: 'booking-1',
        date: '2026-10-01T04:30:00.000Z',
        service_category: 'Grooming',
        status: 'Completed',
        items: ['Full Groom', 'Spa Package'],
        branch_name: 'Main Branch',
        staff_name: 'Ana Groomer',
        total_price: 850,
        cancellation_reason: null,
        payments: [],
      },
      {
        booking_id: 'booking-2',
        date: '2026-09-20T06:00:00.000Z',
        service_category: 'Hotel',
        status: 'Cancelled',
        items: [],
        branch_name: null,
        staff_name: null,
        total_price: 2400,
        cancellation_reason: 'Owner changed plans',
        payments: [],
      },
    ]);
  });

  it('only lists past bookings and only paid transactions', async () => {
    const builders = queueFromResults(
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [COMPLETED_GROOMING, GROUPED_DAYCARE], error: null },
      { data: [], error: null }
    );

    await listPetServiceHistory({ requesterId: 'customer-1', petId: 'pet-1' });

    expect(builders[1]?.in).toHaveBeenCalledWith('status', [
      'Completed',
      'Cancelled',
      'No-show',
    ]);
    expect(builders[2]?.or).toHaveBeenCalledWith(
      'booking_id.in.(booking-1,booking-3),booking_group_id.in.(group-1)'
    );
    expect(builders[2]?.in).toHaveBeenCalledWith('payment_status', [
      'Partially Paid',
      'Fully Paid',
    ]);
  });

  it("attaches each booking's own payments and its group checkout's payment", async () => {
    queueFromResults(
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [COMPLETED_GROOMING, GROUPED_DAYCARE], error: null },
      {
        data: [
          payment({ id: 'txn-down', payment_choice: 'downpayment' }),
          payment({ id: 'txn-balance', payment_choice: 'balance' }),
          payment({
            id: 'txn-group',
            booking_id: null,
            booking_group_id: 'group-1',
            bookings: null,
          }),
        ],
        error: null,
      },
      { data: { full_name: 'Maria Santos' }, error: null }
    );

    const [grooming, daycare] = await listPetServiceHistory({
      requesterId: 'customer-1',
      petId: 'pet-1',
    });

    expect(grooming?.payments.map((p) => p.id)).toEqual([
      'txn-down',
      'txn-balance',
    ]);
    expect(daycare?.payments.map((p) => p.id)).toEqual(['txn-group']);
    expect(grooming?.payments[0]).toMatchObject({
      total_amount: 850,
      customer_name: 'Maria Santos',
      transaction_line_items: [],
    });
  });

  it('skips the payments query when the pet has no past bookings', async () => {
    queueFromResults(
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [], error: null }
    );

    const result = await listPetServiceHistory({
      requesterId: 'customer-1',
      petId: 'pet-1',
    });

    expect(result).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('is available to any staff role', async () => {
    queueFromResults(
      { data: { customer_id: 'customer-1' }, error: null },
      { data: { role: 'Cashier' }, error: null },
      { data: [COMPLETED_GROOMING], error: null },
      { data: [], error: null }
    );

    const result = await listPetServiceHistory({
      requesterId: 'staff-1',
      petId: 'pet-1',
    });

    expect(result).toHaveLength(1);
  });

  it('returns 403 for a different customer', async () => {
    queueFromResults(
      { data: { customer_id: 'customer-1' }, error: null },
      { data: null, error: null }
    );

    await expect(
      listPetServiceHistory({ requesterId: 'customer-2', petId: 'pet-1' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 when the pet does not exist', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      listPetServiceHistory({ requesterId: 'customer-1', petId: 'missing' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
