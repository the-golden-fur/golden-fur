import { afterEach, describe, expect, it, vi } from 'vitest';
import { listGroomingQueue, transitionGroomingStatus } from './grooming.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('grooming.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listGroomingQueue returns the unwrapped sessions on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ sessions: [{ id: 'session-1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listGroomingQueue('token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/grooming/queue'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
    expect(result).toEqual({ data: [{ id: 'session-1' }], error: null });
  });

  it('listGroomingQueue returns an error instead of throwing on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await listGroomingQueue('token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });

  it('transitionGroomingStatus PATCHes the target status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ session: { id: 'session-1', status: 'In Progress' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await transitionGroomingStatus(
      'session-1',
      'token',
      'In Progress'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/grooming/sessions/session-1/status'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'In Progress' }),
      })
    );
    expect(result.data).toMatchObject({ status: 'In Progress' });
  });
});
