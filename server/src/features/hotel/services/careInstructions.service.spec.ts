import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkInHotelStay,
  enumerateDates,
} from './careInstructions.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedInsert {
  table: string;
  payload: unknown;
}

const recordedInserts: RecordedInsert[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'update', 'order', 'limit', 'in']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.insert = vi.fn((payload: unknown) => {
      recordedInserts.push({ table, payload });
      return builder;
    });

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const CONFIRMED_HOTEL_BOOKING = {
  id: 'booking-1',
  pet_id: 'pet-1',
  branch_id: 'branch-1',
  scheduled_end: '2026-08-05T12:00:00.000Z',
  service_category: 'Hotel',
  status: 'Pending',
  downpayment_amount: 500,
};

describe('careInstructions.service (#75)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedInserts.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T09:00:00.000Z'));
  });

  describe('enumerateDates', () => {
    it('is inclusive of both endpoints, one entry for a same-day stay', () => {
      expect(enumerateDates('2026-08-05', '2026-08-05')).toEqual([
        '2026-08-05',
      ]);
    });

    it('enumerates every day across a multi-day range', () => {
      expect(enumerateDates('2026-08-05', '2026-08-07')).toEqual([
        '2026-08-05',
        '2026-08-06',
        '2026-08-07',
      ]);
    });
  });

  describe('checkInHotelStay', () => {
    it('AC-1: creates hotel_stays, the requested instruction rows, and generated care_log_entries', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null }, // bookings lookup
        { data: null, error: null }, // no existing stay
        { data: { id: 'cage-1', status: 'Occupied' }, error: null }, // cage claim
        { data: { id: 'stay-1', status: 'Active' }, error: null },
        { data: { id: 'booking-1', status: 'Pending' }, error: null }, // startBooking: load
        { data: { id: 'booking-1', status: 'In Progress' }, error: null }, // startBooking: update // hotel_stays insert
        {
          data: [
            {
              id: 'med-1',
              medication_name: 'Amoxicillin',
              dose: '250mg',
              scheduled_times: ['8:00 AM'],
            },
          ],
          error: null,
        }, // care_medication_instructions insert
        { data: [{ id: 'log-1', care_type: 'Medication' }], error: null } // care_log_entries insert
      );

      const result = await checkInHotelStay({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: {
          booking_id: 'booking-1',
          cage_id: 'cage-1',
          feeding: [],
          walking: [],
          medications: [
            {
              medication_name: 'Amoxicillin',
              dose: '250mg',
              scheduled_times: ['8:00 AM'],
            },
          ],
          notify_opt_in: false,
        },
      });

      expect(result.stay.id).toBe('stay-1');
      expect(result.medications).toHaveLength(1);
      expect(result.careLogEntries).toHaveLength(1);
    });

    it('#79 revision: a catalog-matched, hotel-supplied feeding row gets a server-computed charged_price', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null }, // bookings lookup
        { data: null, error: null }, // no existing stay
        { data: { id: 'cage-1', status: 'Occupied' }, error: null }, // cage claim
        { data: { id: 'stay-1', status: 'Active' }, error: null },
        { data: { id: 'booking-1', status: 'Pending' }, error: null }, // startBooking: load
        { data: { id: 'booking-1', status: 'In Progress' }, error: null }, // startBooking: update // hotel_stays insert
        { data: [{ id: 'food-1', price: 150 }], error: null }, // food_catalog price lookup
        {
          data: [
            {
              id: 'feed-1',
              meal_time: 'Morning',
              food_type: 'Premium kibble',
              food_catalog_id: 'food-1',
              brought_by_customer: false,
              charged_price: 150,
            },
          ],
          error: null,
        }, // care_feeding_instructions insert
        { data: [{ id: 'log-1' }], error: null } // care_log_entries insert
      );

      await checkInHotelStay({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: {
          booking_id: 'booking-1',
          cage_id: 'cage-1',
          feeding: [
            {
              meal_time: 'Morning',
              food_type: 'Premium kibble',
              quantity: '1 cup',
              food_catalog_id: 'food-1',
              brought_by_customer: false,
            },
          ],
          walking: [],
          medications: [],
          notify_opt_in: false,
        },
      });

      const feedingInsert = recordedInserts.find(
        (write) => write.table === 'care_feeding_instructions'
      );
      expect(feedingInsert?.payload).toMatchObject([
        expect.objectContaining({
          food_catalog_id: 'food-1',
          brought_by_customer: false,
          charged_price: 150,
        }),
      ]);
    });

    it('#79 revision: a freetext (no catalog match) feeding row is never billable, even if the client tries to mark it hotel-supplied', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null },
        { data: null, error: null },
        { data: { id: 'cage-1', status: 'Occupied' }, error: null },
        { data: { id: 'stay-1', status: 'Active' }, error: null },
        { data: { id: 'booking-1', status: 'Pending' }, error: null }, // startBooking: load
        { data: { id: 'booking-1', status: 'In Progress' }, error: null }, // startBooking: update
        // No catalog-price-lookup call expected here - no food_catalog_id
        // was provided, so getCatalogPrices short-circuits before touching
        // supabase at all.
        {
          data: [
            {
              id: 'feed-1',
              meal_time: 'Morning',
              food_type: "Owner's own custom mix",
              food_catalog_id: null,
              brought_by_customer: true,
              charged_price: null,
            },
          ],
          error: null,
        },
        { data: [{ id: 'log-1' }], error: null }
      );

      await checkInHotelStay({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: {
          booking_id: 'booking-1',
          cage_id: 'cage-1',
          feeding: [
            {
              meal_time: 'Morning',
              food_type: "Owner's own custom mix",
              quantity: '1 cup',
              // No food_catalog_id - freetext. brought_by_customer is sent
              // as false here to prove the server ignores it (forces true).
              brought_by_customer: false,
            },
          ],
          walking: [],
          medications: [],
          notify_opt_in: false,
        },
      });

      const feedingInsert = recordedInserts.find(
        (write) => write.table === 'care_feeding_instructions'
      );
      expect(feedingInsert?.payload).toMatchObject([
        expect.objectContaining({
          food_catalog_id: null,
          brought_by_customer: true,
          charged_price: null,
        }),
      ]);
    });

    it('AC-3: auto-fills medications from the M07 current prescription when the field is omitted', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null }, // bookings lookup
        { data: null, error: null }, // no existing stay
        { data: { id: 'cage-1', status: 'Occupied' }, error: null }, // cage claim
        { data: { id: 'stay-1', status: 'Active' }, error: null },
        { data: { id: 'booking-1', status: 'Pending' }, error: null }, // startBooking: load
        { data: { id: 'booking-1', status: 'In Progress' }, error: null }, // startBooking: update // hotel_stays insert
        {
          data: [
            {
              id: 'consult-1',
              medications: [
                { name: 'Rimadyl', dose: '75mg', notes: 'with food' },
              ],
              booking: {
                status: 'Completed',
                completed_at: '2026-08-01T00:00:00.000Z',
              },
            },
          ],
          error: null,
        }, // getCurrentPrescription
        {
          data: [
            {
              id: 'med-1',
              medication_name: 'Rimadyl',
              dose: '75mg',
              scheduled_times: [],
            },
          ],
          error: null,
        }, // care_medication_instructions insert
        { data: [{ id: 'log-1' }], error: null } // care_log_entries insert
      );

      const result = await checkInHotelStay({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: {
          booking_id: 'booking-1',
          cage_id: 'cage-1',
          feeding: [],
          walking: [],
          medications: undefined,
          notify_opt_in: false,
        },
      });

      expect(result.medications).toHaveLength(1);
    });

    it('AC-3: medication section starts empty when no current prescription exists', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null },
        { data: null, error: null },
        { data: { id: 'cage-1', status: 'Occupied' }, error: null },
        { data: { id: 'stay-1', status: 'Active' }, error: null },
        { data: { id: 'booking-1', status: 'Pending' }, error: null }, // startBooking: load
        { data: { id: 'booking-1', status: 'In Progress' }, error: null }, // startBooking: update
        { data: null, error: null } // getCurrentPrescription: none
      );

      const result = await checkInHotelStay({
        requesterId: 'staff-1',
        branchId: 'branch-1',
        input: {
          booking_id: 'booking-1',
          cage_id: 'cage-1',
          feeding: [],
          walking: [],
          medications: undefined,
          notify_opt_in: false,
        },
      });

      expect(result.medications).toHaveLength(0);
    });

    it('AC-5: rejects check-in for a non-Hotel booking', async () => {
      queueFromResults({
        data: { ...CONFIRMED_HOTEL_BOOKING, service_category: 'Grooming' },
        error: null,
      });

      await expect(
        checkInHotelStay({
          requesterId: 'staff-1',
          branchId: 'branch-1',
          input: {
            booking_id: 'booking-1',
            feeding: [],
            walking: [],
            notify_opt_in: false,
          },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-5: rejects check-in for a booking that is not Confirmed', async () => {
      queueFromResults({
        data: { ...CONFIRMED_HOTEL_BOOKING, status: 'Cancelled' },
        error: null,
      });

      await expect(
        checkInHotelStay({
          requesterId: 'staff-1',
          branchId: 'branch-1',
          input: {
            booking_id: 'booking-1',
            feeding: [],
            walking: [],
            notify_opt_in: false,
          },
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects a booking that already has a hotel_stays row', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null },
        { data: { id: 'stay-existing' }, error: null }
      );

      await expect(
        checkInHotelStay({
          requesterId: 'staff-1',
          branchId: 'branch-1',
          input: {
            booking_id: 'booking-1',
            cage_id: 'cage-1',
            feeding: [],
            walking: [],
            notify_opt_in: false,
          },
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('releases the claimed cage if the hotel_stays insert fails', async () => {
      queueFromResults(
        { data: CONFIRMED_HOTEL_BOOKING, error: null },
        { data: null, error: null },
        { data: { id: 'cage-1', status: 'Occupied' }, error: null },
        { data: null, error: { message: 'insert failed' } } // hotel_stays insert fails
      );

      await expect(
        checkInHotelStay({
          requesterId: 'staff-1',
          branchId: 'branch-1',
          input: {
            booking_id: 'booking-1',
            cage_id: 'cage-1',
            feeding: [],
            walking: [],
            notify_opt_in: false,
          },
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(supabase.from).toHaveBeenLastCalledWith('cages');
    });
  });
});
