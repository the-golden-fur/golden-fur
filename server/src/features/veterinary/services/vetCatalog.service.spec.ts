import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMedicationCatalogItem,
  createProcedureCatalogItem,
  deleteMedicationCatalogItem,
  deleteProcedureCatalogItem,
  listMedicationCatalog,
  listProcedureCatalog,
  updateMedicationCatalogItem,
  updateProcedureCatalogItem,
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
    it("returns only the requesting veterinarian's own catalog", async () => {
      queueFromResults({
        data: [{ id: 'med-1', veterinarian_id: VET_ID, name: 'Amoxicillin' }],
        error: null,
      });

      const result = await listMedicationCatalog(VET_ID);

      expect(result).toHaveLength(1);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listMedicationCatalog(VET_ID)).rejects.toMatchObject({
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
    it("updates the requester's own item", async () => {
      queueFromResults({
        data: { id: 'med-1', veterinarian_id: VET_ID, name: 'Renamed' },
        error: null,
      });

      const result = await updateMedicationCatalogItem(VET_ID, 'med-1', {
        name: 'Renamed',
      });

      expect(result.name).toBe('Renamed');
      expect(recordedQueries[0].eqCalls).toContainEqual(['id', 'med-1']);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it("rejects updating another veterinarian's item with a 404", async () => {
      // The .eq('veterinarian_id', requesterId) filter means another vet's
      // row simply doesn't match - maybeSingle resolves with no data, not an
      // error, exactly like an unknown id.
      queueFromResults({ data: null, error: null });

      await expect(
        updateMedicationCatalogItem(OTHER_VET_ID, 'med-1', { name: 'X' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteMedicationCatalogItem', () => {
    it("deletes the requester's own item", async () => {
      queueFromResults({ data: { id: 'med-1' }, error: null });

      await expect(
        deleteMedicationCatalogItem(VET_ID, 'med-1')
      ).resolves.toBeUndefined();
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it("rejects deleting another veterinarian's item with a 404", async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        deleteMedicationCatalogItem(OTHER_VET_ID, 'med-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listProcedureCatalog / createProcedureCatalogItem', () => {
    it('lists and creates scoped to the requester', async () => {
      queueFromResults(
        {
          data: [
            {
              id: 'proc-1',
              veterinarian_id: VET_ID,
              procedure_type: 'Dental',
              description: 'Cleaning',
            },
          ],
          error: null,
        },
        {
          data: {
            id: 'proc-2',
            veterinarian_id: VET_ID,
            procedure_type: 'Surgery',
            description: 'Spay',
          },
          error: null,
        }
      );

      const listed = await listProcedureCatalog(VET_ID);
      const created = await createProcedureCatalogItem(VET_ID, {
        procedure_type: 'Surgery',
        description: 'Spay',
      });

      expect(listed).toHaveLength(1);
      expect(created.id).toBe('proc-2');
    });
  });

  describe('updateProcedureCatalogItem / deleteProcedureCatalogItem', () => {
    it("rejects acting on another veterinarian's procedure with a 404", async () => {
      queueFromResults(
        { data: null, error: null },
        { data: null, error: null }
      );

      await expect(
        updateProcedureCatalogItem(OTHER_VET_ID, 'proc-1', {
          description: 'X',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        deleteProcedureCatalogItem(OTHER_VET_ID, 'proc-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
