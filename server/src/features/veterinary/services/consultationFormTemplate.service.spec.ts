import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConsultationFormTemplate,
  deleteConsultationFormTemplate,
  listConsultationFormTemplates,
  updateConsultationFormTemplate,
} from './consultationFormTemplate.service.ts';
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
    builder.neq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const VET_ID = 'vet-1';
const OTHER_VET_ID = 'vet-2';

const SAMPLE_FIELDS = [
  { id: 'f1', label: 'Skin condition', type: 'text' as const },
];

describe('consultationFormTemplate.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedQueries.length = 0;
  });

  describe('listConsultationFormTemplates', () => {
    it("returns only the requesting veterinarian's own templates", async () => {
      queueFromResults({
        data: [
          {
            id: 'tmpl-1',
            veterinarian_id: VET_ID,
            name: 'Dental Check',
            fields: SAMPLE_FIELDS,
          },
        ],
        error: null,
      });

      const result = await listConsultationFormTemplates(VET_ID);

      expect(result).toHaveLength(1);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listConsultationFormTemplates(VET_ID)).rejects.toMatchObject(
        { statusCode: 400 }
      );
    });
  });

  describe('createConsultationFormTemplate', () => {
    it('creates a template owned by the requester', async () => {
      queueFromResults({
        data: {
          id: 'tmpl-1',
          veterinarian_id: VET_ID,
          name: 'Dental Check',
          fields: SAMPLE_FIELDS,
        },
        error: null,
      });

      const result = await createConsultationFormTemplate(VET_ID, {
        name: 'Dental Check',
        fields: SAMPLE_FIELDS,
      });

      expect(result.id).toBe('tmpl-1');
    });

    it('clears any other default before creating one marked is_default', async () => {
      queueFromResults(
        { data: null, error: null }, // clearOtherDefaults
        {
          data: {
            id: 'tmpl-1',
            veterinarian_id: VET_ID,
            name: 'General Consultation',
            fields: SAMPLE_FIELDS,
            is_default: true,
          },
          error: null,
        }
      );

      await createConsultationFormTemplate(VET_ID, {
        name: 'General Consultation',
        fields: SAMPLE_FIELDS,
        is_default: true,
      });

      expect(recordedQueries).toHaveLength(2);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
      expect(recordedQueries[0].eqCalls).toContainEqual(['is_default', true]);
    });
  });

  describe('updateConsultationFormTemplate', () => {
    it("updates the requester's own template", async () => {
      queueFromResults({
        data: {
          id: 'tmpl-1',
          veterinarian_id: VET_ID,
          name: 'Renamed',
          fields: SAMPLE_FIELDS,
        },
        error: null,
      });

      const result = await updateConsultationFormTemplate(VET_ID, 'tmpl-1', {
        name: 'Renamed',
      });

      expect(result.name).toBe('Renamed');
      expect(recordedQueries[0].eqCalls).toContainEqual(['id', 'tmpl-1']);
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it("rejects updating another veterinarian's template with a 404", async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateConsultationFormTemplate(OTHER_VET_ID, 'tmpl-1', {
          name: 'X',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteConsultationFormTemplate', () => {
    it("deletes the requester's own template", async () => {
      queueFromResults({ data: { id: 'tmpl-1' }, error: null });

      await expect(
        deleteConsultationFormTemplate(VET_ID, 'tmpl-1')
      ).resolves.toBeUndefined();
      expect(recordedQueries[0].eqCalls).toContainEqual([
        'veterinarian_id',
        VET_ID,
      ]);
    });

    it("rejects deleting another veterinarian's template with a 404", async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        deleteConsultationFormTemplate(OTHER_VET_ID, 'tmpl-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
