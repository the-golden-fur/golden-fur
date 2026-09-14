import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listDeletedRecordTables,
  listDeletedRecords,
  purgeDeletedRecord,
  restoreDeletedRecord,
} from './recordsArchive.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('recordsArchive.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listDeletedRecords builds the query string and returns the unwrapped result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ rows: [{ id: 'archive-1' }], total: 1 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listDeletedRecords('token', {
      table: 'pets',
      search: 'Buddy',
      sort: 'deleted_at_asc',
      page: 2,
      pageSize: 10,
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/staff/deleted-records?');
    expect(url).toContain('table=pets');
    expect(url).toContain('search=Buddy');
    expect(url).toContain('sort=deleted_at_asc');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=10');
    expect(result.data).toEqual({ rows: [{ id: 'archive-1' }], total: 1 });
  });

  it('listDeletedRecordTables returns the unwrapped tables array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ tables: ['bookings', 'pets'] }))
    );

    const result = await listDeletedRecordTables('token');

    expect(result.data).toEqual(['bookings', 'pets']);
  });

  it('restoreDeletedRecord posts to the restore endpoint and returns the restored entry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ entry: { id: 'archive-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await restoreDeletedRecord('token', 'archive-1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/deleted-records/archive-1/restore'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.data).toEqual({ id: 'archive-1' });
  });

  it('purgeDeletedRecord issues a DELETE and returns no data on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
    vi.stubGlobal('fetch', fetchMock);

    const result = await purgeDeletedRecord('token', 'archive-1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/deleted-records/archive-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result).toEqual({ data: null, error: null });
  });

  it('returns the server error message on a failed request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false, 403))
    );

    const result = await listDeletedRecords('token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });
});
