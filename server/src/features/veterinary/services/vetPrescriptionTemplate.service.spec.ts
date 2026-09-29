import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  listPrescriptionTemplates,
  updatePrescriptionTemplate,
} from './vetPrescriptionTemplate.service.ts';
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

const SAMPLE_ITEMS = [
  {
    medication_catalog_id: 'med-1',
    name: 'Amoxicillin 250mg',
    medicine_type: 'Oral',
    dose: '1 tablet',
    frequency: 'Twice daily',
  },
];

describe('vetPrescriptionTemplate.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedQueries.length = 0;
  });

  describe('listPrescriptionTemplates', () => {
    it("returns only the requesting veterinarian's own templates", async () => {
      queueFromResults({
        data: [
          {
            id: 'rx-1',
            veterinarian_id: VET_ID,
            name: 'Standard Post-Surgery Recovery',
            items: SAMPLE_ITEMS,
          },
        ],
        error: null,
      });

      const result = await listPrescriptionTemplates(VET_ID);

      expect(result).toHaveLength(1);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listPrescriptionTemplates(VET_ID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('createPrescriptionTemplate', () => {
    it('creates a template owned by the requester', async () => {
      queueFromResults({
        data: {
          id: 'rx-1',
          veterinarian_id: VET_ID,
          name: 'Standard Post-Surgery Recovery',
          items: SAMPLE_ITEMS,
        },
        error: null,
      });

      const result = await createPrescriptionTemplate(VET_ID, {
        name: 'Standard Post-Surgery Recovery',
        items: SAMPLE_ITEMS,
      });

      expect(result.id).toBe('rx-1');
    });
  });

  describe('updatePrescriptionTemplate', () => {
    it("updates the requester's own template", async () => {
      queueFromResults({
        data: {
          id: 'rx-1',
          veterinarian_id: VET_ID,
          name: 'Renamed',
          items: SAMPLE_ITEMS,
        },
        error: null,
      });

      const result = await updatePrescriptionTemplate(VET_ID, 'rx-1', {
        name: 'Renamed',
      });

      expect(result.name).toBe('Renamed');
      expect(recordedQueries[0].eqCalls).toContainEqual(['id', 'rx-1']);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it("rejects updating another veterinarian's template with a 404", async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updatePrescriptionTemplate(OTHER_VET_ID, 'rx-1', { name: 'X' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deletePrescriptionTemplate', () => {
    it("deletes the requester's own template", async () => {
      queueFromResults({ data: { id: 'rx-1' }, error: null });

      await expect(
        deletePrescriptionTemplate(VET_ID, 'rx-1')
      ).resolves.toBeUndefined();
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it("rejects deleting another veterinarian's template with a 404", async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        deletePrescriptionTemplate(OTHER_VET_ID, 'rx-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
