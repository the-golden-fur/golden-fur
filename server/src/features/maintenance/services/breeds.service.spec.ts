import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveBreed,
  createBreed,
  hardDeleteBreed,
  listArchivedBreeds,
  restoreBreed,
  listBreeds,
  updateBreed,
} from './breeds.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.in = builder.in ?? vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('breeds.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listBreeds', () => {
    it('returns every breed when no pet_type filter is given', async () => {
      queueFromResults({
        data: [
          { id: 'breed-1', pet_type: 'Dog', name: 'Beagle' },
          { id: 'breed-2', pet_type: 'Cat', name: 'Persian' },
        ],
        error: null,
      });

      const result = await listBreeds({});

      expect(result).toHaveLength(2);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listBreeds({})).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('createBreed', () => {
    it('creates a breed', async () => {
      queueFromResults(
        { data: [], error: null }, // archived pet type check
        {
          data: { id: 'breed-1', pet_type: 'Dog', name: 'Beagle' },
          error: null,
        }
      );

      const result = await createBreed({ pet_type: 'Dog', name: 'Beagle' });

      expect(result.id).toBe('breed-1');
    });

    it('rejects a duplicate (pet_type, name) with a 409', async () => {
      queueFromResults(
        { data: [], error: null }, // archived pet type check
        {
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        }
      );

      await expect(
        createBreed({ pet_type: 'Dog', name: 'Beagle' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects a breed for an archived pet type with a 409', async () => {
      queueFromResults({ data: [{ key: 'Dog', name: 'Dog' }], error: null });

      await expect(
        createBreed({ pet_type: 'Dog', name: 'Beagle' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateBreed', () => {
    it('updates a breed', async () => {
      queueFromResults({
        data: { id: 'breed-1', pet_type: 'Dog', name: 'Beagle Renamed' },
        error: null,
      });

      const result = await updateBreed('breed-1', { name: 'Beagle Renamed' });

      expect(result.name).toBe('Beagle Renamed');
    });

    it('rejects an unknown breed id with a 404', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateBreed('missing-breed', { name: 'X' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects a rename that collides with an existing breed with a 409', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        updateBreed('breed-1', { name: 'Existing Name' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('archiveBreed (Config-menu consistency change)', () => {
    it('archives a breed', async () => {
      queueFromResults(
        { data: { archived_at: null }, error: null }, // lookup
        {
          data: { id: 'breed-1', archived_at: '2026-09-28T00:00:00Z' },
          error: null,
        } // update
      );

      const result = await archiveBreed('breed-1');

      expect(result.archived_at).toBe('2026-09-28T00:00:00Z');
    });

    it('404s for an unknown breed', async () => {
      queueFromResults({ data: null, error: null });

      await expect(archiveBreed('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('409s when the breed is already archived', async () => {
      queueFromResults({
        data: { archived_at: '2026-09-01T00:00:00Z' },
        error: null,
      });

      await expect(archiveBreed('breed-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('restoreBreed / listArchivedBreeds', () => {
    it('restores an archived breed', async () => {
      queueFromResults(
        { data: { archived_at: '2026-09-01T00:00:00Z' }, error: null },
        { data: { id: 'breed-1', archived_at: null }, error: null }
      );

      const result = await restoreBreed('breed-1');

      expect(result.archived_at).toBeNull();
    });

    it('409s when restoring a breed that is not archived', async () => {
      queueFromResults({ data: { archived_at: null }, error: null });

      await expect(restoreBreed('breed-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('lists archived breeds', async () => {
      queueFromResults({
        data: [{ id: 'breed-1', archived_at: '2026-09-01T00:00:00Z' }],
        error: null,
      });

      await expect(listArchivedBreeds()).resolves.toHaveLength(1);
    });
  });

  describe('hardDeleteBreed', () => {
    it('permanently deletes an archived breed', async () => {
      queueFromResults(
        { data: { archived_at: '2026-09-01T00:00:00Z' }, error: null },
        { data: null, error: null }
      );

      await expect(hardDeleteBreed('breed-1')).resolves.toBeUndefined();
    });

    it('403s when the breed has not been archived first', async () => {
      queueFromResults({ data: { archived_at: null }, error: null });

      await expect(hardDeleteBreed('breed-1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('rejects deleting a breed still referenced by a pet with a 409', async () => {
      queueFromResults(
        { data: { archived_at: '2026-09-01T00:00:00Z' }, error: null },
        { data: null, error: { code: '23503', message: 'fk violation' } }
      );

      await expect(hardDeleteBreed('breed-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
