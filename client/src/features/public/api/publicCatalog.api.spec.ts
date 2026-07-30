import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicPackagesPromos } from './publicCatalog.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('publicCatalog.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the public packages/promos endpoint with no auth headers', async () => {
    const payload = {
      packages: [
        {
          id: 'package-1',
          branch_id: 'branch-1',
          branch_name: 'Makati',
          name: 'Spa Day',
          bundled_price: 999,
          is_active: true,
        },
      ],
      promos: [{ id: 'promo-1', name: 'Grand Opening' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPublicPackagesPromos();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/public/packages-promos')
    );
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
    expect(result).toEqual({ data: payload, error: null });
  });

  it('surfaces the server error message instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Internal server error' }, false, 500)
        )
    );

    const result = await fetchPublicPackagesPromos();

    expect(result).toEqual({ data: null, error: 'Internal server error' });
  });
});
