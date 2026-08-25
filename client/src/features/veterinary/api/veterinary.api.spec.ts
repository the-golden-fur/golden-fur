import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  linkFollowUpBooking,
  listConsultationQueue,
  updateConsultation,
} from './veterinary.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('veterinary.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listConsultationQueue returns consultations on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ consultations: [{ id: 'c-1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listConsultationQueue('token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/veterinary/consultations/queue'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
    expect(result).toEqual({
      data: { consultations: [{ id: 'c-1' }] },
      error: null,
    });
  });

  it('listConsultationQueue passes date_from/date_to when a date range is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ consultations: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await listConsultationQueue('token', {
      dateFrom: '2026-07-20',
      dateTo: '2026-07-26',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('date_from=2026-07-20'),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('date_to=2026-07-26'),
      expect.anything()
    );
  });

  it('listConsultationQueue returns an error instead of throwing on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await listConsultationQueue('token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });

  it('updateConsultation PATCHes the given payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        consultation: {
          id: 'c-1',
          booking: { id: 'booking-1', status: 'In Progress' },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateConsultation('c-1', 'token', {
      status: 'Ongoing',
      diagnosis: 'Ear infection',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/veterinary/consultations/c-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'Ongoing', diagnosis: 'Ear infection' }),
      })
    );
    expect(result.data).toMatchObject({
      booking: { status: 'In Progress' },
    });
  });

  it('linkFollowUpBooking POSTs the booking_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        consultation: { id: 'c-1', follow_up_booking_id: 'booking-2' },
        booking: { id: 'booking-2' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkFollowUpBooking('c-1', 'token', 'booking-2');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/veterinary/consultations/c-1/follow-up'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ booking_id: 'booking-2' }),
      })
    );
    expect(result.data?.booking.id).toBe('booking-2');
  });
});
