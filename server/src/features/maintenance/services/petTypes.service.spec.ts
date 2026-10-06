import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archivePetType,
  assertPetTypesNotArchived,
  createPetType,
  hardDeletePetType,
  listArchivedPetTypes,
  listPetTypes,
  restorePetType,
  updatePetType,
} from './petTypes.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'generated-key') }));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface BuilderRecord {
  [method: string]: ReturnType<typeof vi.fn>;
}

const builders: BuilderRecord[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  builders.length = 0;

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.in = builder.in ?? vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn((payload?: unknown) => {
      (builder as { insertPayload?: unknown }).insertPayload = payload;
      return builder;
    });
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as BuilderRecord);
    return builder as never;
  });
}

describe('petTypes.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPetTypes', () => {
    it('returns every pet type', async () => {
      queueFromResults({
        data: [
          { id: 'pet-type-1', key: 'Dog', name: 'Dog', is_active: true },
          { id: 'pet-type-2', key: 'Cat', name: 'Cat', is_active: true },
        ],
        error: null,
      });

      const result = await listPetTypes();

      expect(result).toHaveLength(2);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listPetTypes()).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('createPetType', () => {
    it('creates a pet type, generating the key server-side rather than accepting it from the client', async () => {
      queueFromResults({
        data: { id: 'pet-type-1', key: 'generated-key', name: 'Rabbit' },
        error: null,
      });

      const result = await createPetType({ name: 'Rabbit' });

      expect(result.id).toBe('pet-type-1');
      expect(
        (builders[0] as { insertPayload?: { key?: string } }).insertPayload?.key
      ).toBe('generated-key');
    });

    it('rejects a duplicate (randomUUID-collision) key with a 409, without referencing client input', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(createPetType({ name: 'Dog' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('updatePetType', () => {
    it('renames a pet type', async () => {
      queueFromResults({
        data: { id: 'pet-type-1', key: 'Dog', name: 'Doggo' },
        error: null,
      });

      const result = await updatePetType('pet-type-1', { name: 'Doggo' });

      expect(result.name).toBe('Doggo');
    });

    it('deactivates a pet type', async () => {
      queueFromResults({
        data: { id: 'pet-type-1', key: 'Dog', name: 'Dog', is_active: false },
        error: null,
      });

      const result = await updatePetType('pet-type-1', { is_active: false });

      expect(result.is_active).toBe(false);
    });

    it('rejects an unknown pet type id with a 404', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updatePetType('missing-pet-type', { name: 'X' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('archivePetType (Config-menu consistency change)', () => {
    it('archives a pet type and deactivates it in the same step', async () => {
      queueFromResults(
        { data: { archived_at: null }, error: null }, // lookup
        {
          data: {
            id: 'pet-type-1',
            is_active: false,
            archived_at: '2026-09-28T00:00:00Z',
          },
          error: null,
        } // update
      );

      const result = await archivePetType('pet-type-1');

      expect(result.is_active).toBe(false);
      expect(result.archived_at).toBe('2026-09-28T00:00:00Z');
    });

    it('404s for an unknown pet type', async () => {
      queueFromResults({ data: null, error: null });

      await expect(archivePetType('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('409s when already archived', async () => {
      queueFromResults({
        data: { archived_at: '2026-09-01T00:00:00Z' },
        error: null,
      });

      await expect(archivePetType('pet-type-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('restorePetType / listArchivedPetTypes', () => {
    it('restores and re-activates an archived pet type', async () => {
      queueFromResults(
        { data: { archived_at: '2026-09-01T00:00:00Z' }, error: null },
        {
          data: { id: 'pet-type-1', is_active: true, archived_at: null },
          error: null,
        }
      );

      const result = await restorePetType('pet-type-1');

      expect(result.is_active).toBe(true);
      expect(result.archived_at).toBeNull();
    });

    it('lists archived pet types', async () => {
      queueFromResults({
        data: [{ id: 'pet-type-1', archived_at: '2026-09-01T00:00:00Z' }],
        error: null,
      });

      await expect(listArchivedPetTypes()).resolves.toHaveLength(1);
    });
  });

  describe('hardDeletePetType', () => {
    it('permanently deletes an archived pet type', async () => {
      queueFromResults(
        { data: { archived_at: '2026-09-01T00:00:00Z' }, error: null },
        { data: null, error: null }
      );

      await expect(hardDeletePetType('pet-type-1')).resolves.toBeUndefined();
    });

    it('403s when the pet type has not been archived first', async () => {
      queueFromResults({ data: { archived_at: null }, error: null });

      await expect(hardDeletePetType('pet-type-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('rejects deleting a pet type still referenced elsewhere with a 409', async () => {
      queueFromResults(
        { data: { archived_at: '2026-09-01T00:00:00Z' }, error: null },
        { data: null, error: { code: '23503', message: 'fk violation' } }
      );

      await expect(hardDeletePetType('pet-type-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('assertPetTypesNotArchived', () => {
    it('resolves when none of the keys is archived', async () => {
      queueFromResults({ data: [], error: null });

      await expect(assertPetTypesNotArchived(['Dog'])).resolves.toBeUndefined();
    });

    it('409s naming an archived pet type', async () => {
      queueFromResults({
        data: [{ key: 'Ferret', name: 'Ferret' }],
        error: null,
      });

      await expect(assertPetTypesNotArchived(['Ferret'])).rejects.toMatchObject(
        { statusCode: 409 }
      );
    });

    it('skips the query for an empty key list', async () => {
      await expect(assertPetTypesNotArchived([])).resolves.toBeUndefined();
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });
});
