import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDailySalesReport } from './reports.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('reports.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getDailySalesReport omits branch_id when no branch is given (combined-branches view)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ report: { report_date: '2026-09-14' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDailySalesReport('2026-09-14', null, 'token');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('report_date=2026-09-14');
    expect(url).not.toContain('branch_id');
    expect(result.data).toEqual({ report_date: '2026-09-14' });
  });

  it('getDailySalesReport includes branch_id when a branch is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ report: { report_date: '2026-09-14' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await getDailySalesReport('2026-09-14', 'branch-makati', 'token');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('branch_id=branch-makati');
  });

  it('returns the server error message on a failed request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await getDailySalesReport('2026-09-14', null, 'token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });
});
