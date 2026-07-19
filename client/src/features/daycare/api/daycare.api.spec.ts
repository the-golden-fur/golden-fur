import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkInDaycareSession, checkOutDaycareSession } from './daycare.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('daycare.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checkInDaycareSession POSTs the payload and returns the session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ session: { id: 'session-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkInDaycareSession('token', {
      pet_id: 'pet-1',
      branch_id: 'branch-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/daycare/check-in'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pet_id: 'pet-1', branch_id: 'branch-1' }),
      })
    );
    expect(result).toEqual({ data: { id: 'session-1' }, error: null });
  });

  it('AC-3: surfaces a cutoff-blocked error instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'Check-in unavailable after 4:00 PM' },
            false,
            400
          )
        )
    );

    const result = await checkInDaycareSession('token', {
      pet_id: 'pet-1',
      branch_id: 'branch-1',
    });

    expect(result).toEqual({
      data: null,
      error: 'Check-in unavailable after 4:00 PM',
    });
  });

  it('checkOutDaycareSession POSTs to the checkout endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        session: { id: 'session-1', status: 'Completed', computed_charge: 100 },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkOutDaycareSession('session-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/daycare/sessions/session-1/checkout'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.data).toMatchObject({ computed_charge: 100 });
  });
});
