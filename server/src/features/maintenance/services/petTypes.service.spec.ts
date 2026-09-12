import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPetType,
  deletePetType,
  listPetTypes,
  updatePetType,
} from './petTypes.service.ts';
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
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

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
    it('creates a pet type', async () => {
      queueFromResults({
        data: { id: 'pet-type-1', key: 'Rabbit', name: 'Rabbit' },
        error: null,
      });

      const result = await createPetType({ key: 'Rabbit', name: 'Rabbit' });

      expect(result.id).toBe('pet-type-1');
    });

    it('rejects a duplicate key with a 409', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        createPetType({ key: 'Dog', name: 'Dog' })
      ).rejects.toMatchObject({ statusCode: 409 });
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

  describe('deletePetType', () => {
    it('deletes a pet type', async () => {
      queueFromResults({ data: null, error: null });

      await expect(deletePetType('pet-type-1')).resolves.toBeUndefined();
    });

    it('rejects deleting a pet type still referenced by a pet/breed with a 409', async () => {
      queueFromResults({
        data: null,
        error: { code: '23503', message: 'foreign key violation' },
      });

      await expect(deletePetType('pet-type-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
