import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkInHotelStay,
  checkOutHotelStay,
  completeCareLogEntry,
  getCageGrid,
  getCageOccupants,
  setCageMaintenanceStatus,
} from './hotel.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('hotel.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checkInHotelStay POSTs the payload and returns the full check-in result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        stay: { id: 'stay-1' },
        feeding: [],
        walking: [],
        medications: [],
        careLogEntries: [],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkInHotelStay('token', {
      booking_id: 'booking-1',
      feeding: [],
      walking: [],
      notify_opt_in: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/hotel/check-in'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.data?.stay.id).toBe('stay-1');
  });

  it('surfaces a rejection error (e.g. cage no longer available) instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Selected cage is not available' }, false, 409)
        )
    );

    const result = await checkInHotelStay('token', {
      booking_id: 'booking-1',
      feeding: [],
      walking: [],
      notify_opt_in: false,
    });

    expect(result).toEqual({
      data: null,
      error: 'Selected cage is not available',
    });
  });

  it('completeCareLogEntry PATCHes the completion endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ entry: { id: 'entry-1', completed_at: 'now' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeCareLogEntry('entry-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/hotel/care-log-entry/entry-1/complete'),
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(result.data?.completed_at).toBe('now');
  });

  it('getCageGrid unwraps the { grid } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ grid: { S: [], M: [], L: [], XL: [] } })
        )
    );

    const result = await getCageGrid('token');

    expect(result.data).toEqual({ S: [], M: [], L: [], XL: [] });
  });

  it('getCageGrid and getCageOccupants ask for their own branch unless told otherwise', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ grid: {}, occupants: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getCageGrid('token');
    await getCageOccupants('token');

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/hotel\/cages$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/hotel\/cages\/occupants$/);
  });

  it('getCageGrid and getCageOccupants pass a Superadmin branch choice through', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ grid: {}, occupants: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getCageGrid('token', 'all');
    await getCageOccupants('token', 'branch-2');

    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/hotel\/cages\?branch_id=all$/
    );
    expect(fetchMock.mock.calls[1][0]).toMatch(
      /\/hotel\/cages\/occupants\?branch_id=branch-2$/
    );
  });

  it('setCageMaintenanceStatus PATCHes the cage status endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ cage: { id: 'cage-1', status: 'Under Maintenance' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await setCageMaintenanceStatus(
      'cage-1',
      'Under Maintenance',
      'token'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/hotel/cage/cage-1/status'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'Under Maintenance' }),
      })
    );
    expect(result.data?.status).toBe('Under Maintenance');
  });

  it('checkOutHotelStay POSTs to the checkout endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        stay: { id: 'stay-1' },
        downpaymentAmount: 1000,
        extensionFee: null,
        remainingBalance: 1000,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkOutHotelStay('stay-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/hotel/stays/stay-1/checkout'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.data?.remainingBalance).toBe(1000);
  });
});
