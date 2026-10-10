import { beforeEach, describe, expect, it, vi } from 'vitest';
import { linkFollowUpBooking } from './followUp.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { sendFollowUpScheduledNotification } from './followUpNotifications.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

// Its own spec covers the message; here it only matters that the owner is
// told once the follow-up is linked, and never when linking is refused.
vi.mock('./followUpNotifications.service.ts', () => ({
  sendFollowUpScheduledNotification: vi.fn().mockResolvedValue(undefined),
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
    accepted_by: null,
    follow_up_date: null,
    follow_up_booking_id: null,
    booking: bookingRow(),
    ...overrides,
  };
}

describe('followUp.service (#67, revised for ScheduleFollowUpModal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedWrites.length = 0;
  });

  it('links an already-created booking as the consultation follow-up', async () => {
    queueFromResults(
      { data: consultationRow(), error: null }, // getConsultation
      {
        data: bookingRow({
          id: 'booking-2',
          scheduled_start: '2026-08-01T02:00:00.000Z',
        }),
        error: null,
      }, // follow-up booking lookup
      {
        data: {
          ...consultationRow({ follow_up_date: '2026-08-01' }),
          follow_up_booking_id: 'booking-2',
          booking: bookingRow(),
        },
        error: null,
      } // consultation update
    );

    const result = await linkFollowUpBooking({
      consultationId: 'consultation-1',
      bookingId: 'booking-2',
      requesterId: 'vet-1',
      reason: 'Recheck the ear',
    });

    expect(result.booking.id).toBe('booking-2');
    expect(result.consultation.follow_up_booking_id).toBe('booking-2');

    const consultationUpdate = recordedWrites.find(
      (write) => write.table === 'consultations'
    );
    expect(consultationUpdate?.payload).toMatchObject({
      follow_up_date: '2026-08-01',
      follow_up_booking_id: 'booking-2',
      follow_up_reason: 'Recheck the ear',
    });
    expect(sendFollowUpScheduledNotification).toHaveBeenCalledWith({
      booking: expect.objectContaining({
        id: 'booking-2',
        customer_id: 'customer-1',
      }),
      veterinarianId: 'vet-1',
      reason: 'Recheck the ear',
    });
  });

  it('only lets the vet who handled the visit schedule its follow-up', async () => {
    queueFromResults({
      data: consultationRow({ accepted_by: 'vet-1' }),
      error: null,
    });

    await expect(
      linkFollowUpBooking({
        consultationId: 'consultation-1',
        bookingId: 'booking-2',
        requesterId: 'vet-2',
        reason: 'Recheck the ear',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(sendFollowUpScheduledNotification).not.toHaveBeenCalled();

    expect(recordedWrites).toEqual([]);
  });

  it('falls back to the assigned vet on an older visit nobody is recorded as having taken', async () => {
    queueFromResults({
      data: consultationRow({ accepted_by: null, veterinarian_id: 'vet-1' }),
      error: null,
    });

    await expect(
      linkFollowUpBooking({
        consultationId: 'consultation-1',
        bookingId: 'booking-2',
        requesterId: 'vet-2',
        reason: 'Recheck the ear',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects linking a follow-up while the consultation booking is still Pending or In Progress (not finished yet)', async () => {
    queueFromResults({
      data: consultationRow({ booking: bookingRow({ status: 'In Progress' }) }),
      error: null,
    });

    await expect(
      linkFollowUpBooking({
        consultationId: 'consultation-1',
        bookingId: 'booking-2',
        requesterId: 'vet-1',
        reason: 'Recheck the ear',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects linking a second follow-up for the same consultation', async () => {
    queueFromResults({
      data: consultationRow({ follow_up_booking_id: 'booking-existing' }),
      error: null,
    });

    await expect(
      linkFollowUpBooking({
        consultationId: 'consultation-1',
        bookingId: 'booking-2',
        requesterId: 'vet-1',
        reason: 'Recheck the ear',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a booking id that does not exist', async () => {
    queueFromResults(
      { data: consultationRow(), error: null }, // getConsultation
      { data: null, error: null } // follow-up booking lookup - not found
    );

    await expect(
      linkFollowUpBooking({
        consultationId: 'consultation-1',
        bookingId: 'booking-missing',
        requesterId: 'vet-1',
        reason: 'Recheck the ear',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a booking that belongs to a different pet than the consultation', async () => {
    queueFromResults(
      { data: consultationRow(), error: null }, // getConsultation
      {
        data: bookingRow({ id: 'booking-2', pet_id: 'pet-other' }),
        error: null,
      } // follow-up booking lookup
    );

    await expect(
      linkFollowUpBooking({
        consultationId: 'consultation-1',
        bookingId: 'booking-2',
        requesterId: 'vet-1',
        reason: 'Recheck the ear',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
