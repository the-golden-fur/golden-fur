import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listCageOccupants } from './cageOccupants.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** One result per table - the service reads each table at most once. */
function tableResults(results: Record<string, QueryResult>) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = results[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'in']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const ok = (data: unknown): QueryResult => ({ data, error: null });

describe('cageOccupants.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists a checked-in Hotel pet with its booking end as the expected checkout', async () => {
    tableResults({
      stays: ok([
        {
          id: 'stay-1',
          cage_id: 'cage-1',
          stay_type: 'Hotel',
          booking_id: 'booking-1',
          pet_id: 'pet-1',
          check_in_at: '2026-08-01T02:00:00.000Z',
        },
      ]),
      bookings: ok([
        {
          id: 'booking-1',
          scheduled_end: '2026-08-04T02:00:00.000Z',
          payment_status: 'Fully Paid',
          pay_at_checkout: false,
        },
      ]),
      pets: ok([{ id: 'pet-1', name: 'Mochi', customer_id: 'cust-1' }]),
      customer_profiles: ok([{ id: 'cust-1', full_name: 'Jamie Cruz' }]),
    });

    await expect(listCageOccupants('branch-1')).resolves.toEqual([
      {
        stay_id: 'stay-1',
        cage_id: 'cage-1',
        pet_name: 'Mochi',
        owner_name: 'Jamie Cruz',
        service: 'Hotel',
        booking_id: 'booking-1',
        since: '2026-08-01T02:00:00.000Z',
        expected_checkout_at: '2026-08-04T02:00:00.000Z',
        overdue_fee_per_hour: null,
        overdue_grace_minutes: null,
        payment: 'paid',
      },
    ]);
  });

  describe('payment', () => {
    async function paymentFor(
      booking: { payment_status: string; pay_at_checkout: boolean } | null,
      stayType: 'Hotel' | 'Daycare' = 'Hotel'
    ) {
      tableResults({
        stays: ok([
          {
            id: 'stay-1',
            cage_id: 'cage-1',
            stay_type: stayType,
            booking_id: booking ? 'booking-1' : null,
            pet_id: 'pet-1',
            check_in_at: '2026-08-01T02:00:00.000Z',
          },
        ]),
        bookings: ok(
          booking
            ? [
                {
                  id: 'booking-1',
                  scheduled_end: '2026-08-04T02:00:00.000Z',
                  ...booking,
                },
              ]
            : []
        ),
        pets: ok([{ id: 'pet-1', name: 'Mochi' }]),
      });

      const [occupant] = await listCageOccupants('branch-1');
      return occupant;
    }

    it('is "pay_at_checkout" for a booking billed at checkout, whatever its payment status', async () => {
      expect(
        (await paymentFor({ payment_status: 'Pending', pay_at_checkout: true }))
          .payment
      ).toBe('pay_at_checkout');
    });

    it('follows the payment status of an ordinary booking', async () => {
      expect(
        (
          await paymentFor({
            payment_status: 'Partially Paid',
            pay_at_checkout: false,
          })
        ).payment
      ).toBe('partially_paid');
      expect(
        (
          await paymentFor({
            payment_status: 'Pending',
            pay_at_checkout: false,
          })
        ).payment
      ).toBe('unpaid');
    });

    it('is null when there is no booking behind the stay', async () => {
      expect((await paymentFor(null, 'Daycare')).payment).toBeNull();
    });

    it('a pay-at-checkout Daycare pet runs up no overdue fee - its end time is only an estimate', async () => {
      expect(
        await paymentFor(
          { payment_status: 'Pending', pay_at_checkout: true },
          'Daycare'
        )
      ).toMatchObject({
        overdue_fee_per_hour: null,
        overdue_grace_minutes: null,
      });
    });
  });

  it('lists a checked-in Daycare pet against the hours it was booked for', async () => {
    tableResults({
      stays: ok([
        {
          cage_id: 'cage-2',
          stay_type: 'Daycare',
          booking_id: 'booking-2',
          pet_id: 'pet-2',
          check_in_at: '2026-08-01T02:00:00.000Z',
        },
      ]),
      bookings: ok([
        { id: 'booking-2', scheduled_end: '2026-08-01T06:00:00.000Z' },
      ]),
      pets: ok([{ id: 'pet-2', name: 'Max' }]),
    });

    const [occupant] = await listCageOccupants('branch-1');

    expect(occupant).toMatchObject({
      service: 'Daycare',
      pet_name: 'Max',
      expected_checkout_at: '2026-08-01T06:00:00.000Z',
      // Daycare is charged hourly once past its booked end.
      overdue_fee_per_hour: 50,
      overdue_grace_minutes: 15,
    });
  });

  it('has no expected checkout for a walk-in Daycare session with no booking', async () => {
    tableResults({
      stays: ok([
        {
          cage_id: 'cage-1',
          stay_type: 'Daycare',
          booking_id: null,
          pet_id: 'pet-1',
          check_in_at: '2026-08-01T02:00:00.000Z',
        },
      ]),
      pets: ok([{ id: 'pet-1', name: 'Biscuit' }]),
    });

    const [occupant] = await listCageOccupants('branch-1');

    expect(occupant).toMatchObject({
      service: 'Daycare',
      booking_id: null,
      expected_checkout_at: null,
    });
    // No booking to look up.
    expect(supabase.from).not.toHaveBeenCalledWith('bookings');
  });

  it('reads every branch when given no branch (Superadmin, all branches)', async () => {
    const eqCalls: unknown[][] = [];
    vi.mocked(supabase.from).mockImplementation((() => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.eq = vi.fn((...args: unknown[]) => {
        eqCalls.push(args);
        return builder;
      });
      builder.then = (resolve: (_result: QueryResult) => void) =>
        resolve({ data: [], error: null });
      return builder;
    }) as never);

    await listCageOccupants(null);

    expect(eqCalls).toEqual([['status', 'Active']]);
  });

  it('returns an empty list, with no further lookups, when nobody is checked in', async () => {
    tableResults({ stays: ok([]) });

    await expect(listCageOccupants('branch-1')).resolves.toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('surfaces a query error', async () => {
    tableResults({
      stays: { data: null, error: { message: 'boom' } },
    });

    await expect(listCageOccupants('branch-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
