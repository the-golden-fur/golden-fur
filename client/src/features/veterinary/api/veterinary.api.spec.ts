import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listConsultationQueue,
  scheduleFollowUp,
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

  it('listConsultationQueue returns the unwrapped consultations on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ consultations: [{ id: 'c-1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listConsultationQueue('token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/veterinary/consultations/queue'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
    expect(result).toEqual({ data: [{ id: 'c-1' }], error: null });
  });

  it('listConsultationQueue returns an error instead of throwing on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await listConsultationQueue('token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });

  it('updateConsultation PATCHes the given payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ consultation: { id: 'c-1', status: 'Ongoing' } })
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
    expect(result.data).toMatchObject({ status: 'Ongoing' });
  });

  it('scheduleFollowUp POSTs the follow_up_date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        consultation: { id: 'c-1', follow_up_booking_id: 'booking-2' },
        booking: { id: 'booking-2' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await scheduleFollowUp('c-1', 'token', '2026-08-01');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/veterinary/consultations/c-1/follow-up'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ follow_up_date: '2026-08-01' }),
      })
    );
    expect(result.data?.booking.id).toBe('booking-2');
  });
});
