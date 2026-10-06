import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMedicationCatalogItem,
  deleteMedicationCatalogItem,
  listMedicationCatalog,
  updateMedicationCatalogItem,
} from './vetCatalog.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedQuery {
  eqCalls: Array<[string, unknown]>;
}

const recordedQueries: RecordedQuery[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const query: RecordedQuery = { eqCalls: [] };
    recordedQueries.push(query);

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      query.eqCalls.push([column, value]);
      return builder;
    });
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const VET_ID = 'vet-1';
const OTHER_VET_ID = 'vet-2';

describe('vetCatalog.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedQueries.length = 0;
  });

  describe('listMedicationCatalog', () => {
    it('returns the shared clinic list, whichever vet added each item', async () => {
      queueFromResults({
        data: [
          { id: 'med-1', veterinarian_id: VET_ID, name: 'Amoxicillin' },
          { id: 'med-2', veterinarian_id: OTHER_VET_ID, name: 'Meloxicam' },
        ],
        error: null,
      });

      const result = await listMedicationCatalog();

      expect(result).toHaveLength(2);
      expect(recordedQueries[0].eqCalls).toEqual([]);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listMedicationCatalog()).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('createMedicationCatalogItem', () => {
    it('creates a medication catalog item owned by the requester', async () => {
      queueFromResults({
        data: { id: 'med-1', veterinarian_id: VET_ID, name: 'Amoxicillin' },
        error: null,
      });

      const result = await createMedicationCatalogItem(VET_ID, {
        name: 'Amoxicillin',
      });

      expect(result.id).toBe('med-1');
    });
  });

  describe('updateMedicationCatalogItem', () => {
    it('lets any vet update an item on the shared list', async () => {
      queueFromResults({
        data: { id: 'med-1', veterinarian_id: VET_ID, name: 'Renamed' },
        error: null,
      });

      const result = await updateMedicationCatalogItem('med-1', {
        name: 'Renamed',
      });

      expect(result.name).toBe('Renamed');
      expect(recordedQueries[0].eqCalls).toEqual([['id', 'med-1']]);
    });

    it('rejects an unknown item with a 404', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateMedicationCatalogItem('med-1', { name: 'X' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteMedicationCatalogItem', () => {
    it('lets any vet delete an item on the shared list', async () => {
      queueFromResults({ data: { id: 'med-1' }, error: null });

      await expect(
        deleteMedicationCatalogItem('med-1')
      ).resolves.toBeUndefined();
      expect(recordedQueries[0].eqCalls).toEqual([['id', 'med-1']]);
    });

    it('rejects an unknown item with a 404', async () => {
      queueFromResults({ data: null, error: null });

      await expect(deleteMedicationCatalogItem('med-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // #117: procedure-catalog coverage removed alongside the rest of the
  // personal procedure catalog - see consultationFormTemplate.service.spec.ts
  // for its owner-scoped replacement's coverage.
});
