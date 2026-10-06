import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createServiceCatalogItem,
  deleteServiceCatalogItem,
  linkFollowUpBooking,
  listConsultationQueue,
  listServiceCatalog,
  updateConsultation,
  updateServiceCatalogItem,
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

  it('listConsultationQueue says all_dates=true for "All dates", which has no bounds to send', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ consultations: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await listConsultationQueue('token', { allDates: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/veterinary\/consultations\/queue\?all_dates=true$/
      ),
      expect.anything()
    );
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

  it('linkFollowUpBooking sends the new booking and the reason for the follow-up', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        consultation: { id: 'c-1', follow_up_booking_id: 'booking-2' },
        booking: { id: 'booking-2' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkFollowUpBooking('c-1', 'token', {
      booking_id: 'booking-2',
      reason: 'Recheck the ear',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/veterinary/consultations/c-1/follow-up'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          booking_id: 'booking-2',
          reason: 'Recheck the ear',
        }),
      })
    );
    expect(result.data?.consultation.follow_up_booking_id).toBe('booking-2');
  });

  it('linkFollowUpBooking surfaces the server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Already scheduled' }, false))
    );

    const result = await linkFollowUpBooking('c-1', 'token', {
      booking_id: 'booking-2',
      reason: 'Recheck the ear',
    });

    expect(result).toEqual({ data: null, error: 'Already scheduled' });
  });

  describe('shared service list', () => {
    const SURGERY = { id: 'svc-1', name: 'Surgery', default_price: 10000 };

    it('listServiceCatalog returns the list', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ services: [SURGERY] }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await listServiceCatalog('token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/veterinary/service-catalog'),
        expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
      );
      expect(result).toEqual({ data: [SURGERY], error: null });
    });

    it('createServiceCatalogItem posts the name and price', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ service: SURGERY }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await createServiceCatalogItem('token', {
        name: 'Surgery',
        default_price: 10000,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/veterinary/service-catalog'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Surgery', default_price: 10000 }),
        })
      );
      expect(result.data).toEqual(SURGERY);
    });

    it('updateServiceCatalogItem patches one entry', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ service: { ...SURGERY, default_price: 12000 } })
        );
      vi.stubGlobal('fetch', fetchMock);

      const result = await updateServiceCatalogItem('svc-1', 'token', {
        default_price: 12000,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/veterinary/service-catalog/svc-1'),
        expect.objectContaining({ method: 'PATCH' })
      );
      expect(result.data?.default_price).toBe(12000);
    });

    it('deleteServiceCatalogItem deletes one entry', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
      vi.stubGlobal('fetch', fetchMock);

      const result = await deleteServiceCatalogItem('svc-1', 'token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/veterinary/service-catalog/svc-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result).toEqual({ data: null, error: null });
    });
  });
});
