import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createServiceType,
  listServiceTypes,
  updateServiceType,
} from './serviceTypes.service.ts';
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
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('serviceTypes.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listServiceTypes', () => {
    it('returns every service type', async () => {
      queueFromResults({
        data: [
          { id: 'type-1', key: 'Grooming', name: 'Grooming' },
          { id: 'type-2', key: 'Hotel', name: 'Hotel' },
        ],
        error: null,
      });

      const result = await listServiceTypes();

      expect(result).toHaveLength(2);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listServiceTypes()).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('createServiceType', () => {
    it('creates a service type, defaulting the picker toggles to false', async () => {
      queueFromResults({
        data: { id: 'type-1', key: 'Boarding', name: 'Boarding' },
        error: null,
      });

      const result = await createServiceType(
        { key: 'Boarding', name: 'Boarding' },
        'staff-1'
      );

      expect(result.id).toBe('type-1');
    });

    it('rejects a duplicate key with a 409', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        createServiceType({ key: 'Grooming', name: 'Grooming' }, 'staff-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateServiceType', () => {
    it('updates a service type', async () => {
      queueFromResults({
        data: { id: 'type-1', key: 'Grooming', name: 'Grooming & Spa' },
        error: null,
      });

      const result = await updateServiceType(
        'type-1',
        { name: 'Grooming & Spa' },
        'staff-1'
      );

      expect(result.name).toBe('Grooming & Spa');
    });

    it('rejects an unknown service type id with a 404', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateServiceType('missing-type', { name: 'X' }, 'staff-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
