import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleFollowUp } from './followUp.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
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

    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
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

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    customer_id: 'customer-1',
    pet_id: 'pet-1',
    branch_id: 'branch-makati',
    service_category: 'Veterinary',
    scheduled_start: '2026-07-19T02:00:00.000Z',
    scheduled_end: '2026-07-19T03:00:00.000Z',
    total_price: 800,
    status: 'Completed',
    ...overrides,
  };
}

/** getConsultation's CONSULTATION_SELECT ('*, booking:bookings(*)') embeds
 * the full booking row - "has this consultation finished" is read off the
 * joined booking's status now that consultations.status no longer exists. */
function consultationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'consultation-1',
    booking_id: 'booking-1',
    pet_id: 'pet-1',
    veterinarian_id: 'vet-1',
    follow_up_date: null,
    follow_up_booking_id: null,
    booking: bookingRow(),
    ...overrides,
  };
}

describe('followUp.service (#67)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  it('AC-1/AC-2: creates a Pending booking and links follow_up_booking_id on the originating consultation', async () => {
    queueFromResults(
      { data: consultationRow(), error: null }, // getConsultation
      { data: bookingRow(), error: null }, // originating booking lookup
      {
        data: { id: 'booking-2', ...bookingRow({ id: 'booking-2' }) },
        error: null,
      }, // new booking insert
      {
        data: [
          {
            service_id: 'service-1',
            package_id: null,
            price_at_booking: 800,
            duration_minutes_at_booking: 60,
          },
        ],
        error: null,
      }, // original booking's booking_items fetch
      { data: null, error: null }, // booking_items insert onto the new booking
      {
        data: {
          ...consultationRow({ follow_up_date: '2026-08-01' }),
          follow_up_booking_id: 'booking-2',
          booking: bookingRow(),
        },
        error: null,
      } // consultation update
    );

    const result = await scheduleFollowUp({
      requesterId: 'vet-1',
      consultationId: 'consultation-1',
      followUpDate: '2026-08-01',
    });

    expect(result.booking.id).toBe('booking-2');
    expect(result.consultation.follow_up_booking_id).toBe('booking-2');

    const bookingInsert = recordedWrites.find(
      (write) => write.table === 'bookings' && write.method === 'insert'
    );
    expect(bookingInsert?.payload).toMatchObject({
      customer_id: 'customer-1',
      pet_id: 'pet-1',
      branch_id: 'branch-makati',
      service_category: 'Veterinary',
      status: 'Pending',
      total_price: 800,
    });

    const consultationUpdate = recordedWrites.find(
      (write) => write.table === 'consultations'
    );
    expect(consultationUpdate?.payload).toMatchObject({
      follow_up_date: '2026-08-01',
      follow_up_booking_id: 'booking-2',
    });
  });

  it('rejects scheduling a follow-up while the consultation booking is still Pending or In Progress (not finished yet)', async () => {
    queueFromResults({
      data: consultationRow({ booking: bookingRow({ status: 'In Progress' }) }),
      error: null,
    });

    await expect(
      scheduleFollowUp({
        requesterId: 'vet-1',
        consultationId: 'consultation-1',
        followUpDate: '2026-08-01',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects scheduling a second follow-up for the same consultation', async () => {
    queueFromResults({
      data: consultationRow({ follow_up_booking_id: 'booking-existing' }),
      error: null,
    });

    await expect(
      scheduleFollowUp({
        requesterId: 'vet-1',
        consultationId: 'consultation-1',
        followUpDate: '2026-08-01',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
