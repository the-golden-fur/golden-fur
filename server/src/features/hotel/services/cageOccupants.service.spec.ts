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
        { id: 'booking-1', scheduled_end: '2026-08-04T02:00:00.000Z' },
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
      },
    ]);
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
