import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createServiceCatalogItem,
  deleteServiceCatalogItem,
  listServiceCatalog,
  updateServiceCatalogItem,
} from './vetServiceCatalog.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedQuery {
  table: string;
  eqCalls: Array<[string, unknown]>;
  writes: Array<{ method: string; payload?: unknown }>;
}

const recordedQueries: RecordedQuery[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const query: RecordedQuery = { table, eqCalls: [], writes: [] };
    recordedQueries.push(query);

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      query.eqCalls.push([column, value]);
      return builder;
    });
    for (const method of ['insert', 'update', 'delete']) {
      builder[method] = vi.fn((payload?: unknown) => {
        query.writes.push({ method, payload });
        return builder;
      });
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const VET_ID = 'vet-1';
const SURGERY = {
  id: 'svc-1',
  name: 'Surgery',
  default_price: 10000,
  created_by: 'vet-2',
};

describe('vetServiceCatalog.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedQueries.length = 0;
  });

  it('lists the shared clinic list, whoever added each entry', async () => {
    queueFromResults({ data: [SURGERY], error: null });

    const result = await listServiceCatalog();

    expect(result).toEqual([SURGERY]);
    expect(recordedQueries[0].table).toBe('vet_service_catalog');
    expect(recordedQueries[0].eqCalls).toEqual([]);
  });

  it('propagates a list error as a 400', async () => {
    queueFromResults({ data: null, error: { message: 'boom' } });

    await expect(listServiceCatalog()).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('adds a service, recording who added it', async () => {
    queueFromResults({ data: SURGERY, error: null });

    const result = await createServiceCatalogItem(VET_ID, {
      name: 'Surgery',
      default_price: 10000,
    });

    expect(result.id).toBe('svc-1');
    expect(recordedQueries[0].writes[0]).toEqual({
      method: 'insert',
      payload: { name: 'Surgery', default_price: 10000, created_by: VET_ID },
    });
  });

  it('lets any vet update an entry', async () => {
    queueFromResults({
      data: { ...SURGERY, default_price: 12000 },
      error: null,
    });

    const result = await updateServiceCatalogItem('svc-1', {
      default_price: 12000,
    });

    expect(result.default_price).toBe(12000);
    expect(recordedQueries[0].eqCalls).toEqual([['id', 'svc-1']]);
    expect(recordedQueries[0].writes[0].payload).toMatchObject({
      default_price: 12000,
    });
  });

  it('rejects updating an unknown entry with a 404', async () => {
    queueFromResults({ data: null, error: null });

    await expect(
      updateServiceCatalogItem('svc-missing', { name: 'X' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets any vet delete an entry', async () => {
    queueFromResults({ data: { id: 'svc-1' }, error: null });

    await expect(deleteServiceCatalogItem('svc-1')).resolves.toBeUndefined();
    expect(recordedQueries[0].eqCalls).toEqual([['id', 'svc-1']]);
  });

  it('rejects deleting an unknown entry with a 404', async () => {
    queueFromResults({ data: null, error: null });

    await expect(deleteServiceCatalogItem('svc-missing')).rejects.toMatchObject(
      { statusCode: 404 }
    );
  });
});
