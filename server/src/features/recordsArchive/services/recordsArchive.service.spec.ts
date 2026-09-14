import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listDeletedRecordTables,
  listDeletedRecords,
  purgeDeletedRecord,
  restoreDeletedRecord,
} from './recordsArchive.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.ilike = vi.fn(() => builder);
    builder.gte = vi.fn(() => builder);
    builder.lte = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.range = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('recordsArchive.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDeletedRecords', () => {
    it('returns rows and the total count', async () => {
      queueFromResults({
        data: [
          {
            id: 'archive-1',
            source_table: 'pets',
            record_id: 'pet-1',
            row_data: { id: 'pet-1', name: 'Buddy' },
            deleted_by: null,
            deleted_at: '2026-09-01T00:00:00.000Z',
            restored_at: null,
            restored_by: null,
          },
        ],
        error: null,
        count: 1,
      });

      const result = await listDeletedRecords({
        sort: 'deleted_at_desc',
        limit: 25,
        offset: 0,
      });

      expect(result.total).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ id: 'archive-1' });
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' }, count: null });

      await expect(
        listDeletedRecords({ sort: 'deleted_at_desc', limit: 25, offset: 0 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('listDeletedRecordTables', () => {
    it('dedupes and sorts the distinct source tables', async () => {
      queueFromResults({
        data: [
          { source_table: 'pets' },
          { source_table: 'bookings' },
          { source_table: 'pets' },
        ],
        error: null,
      });

      const tables = await listDeletedRecordTables();

      expect(tables).toEqual(['bookings', 'pets']);
    });
  });

  describe('restoreDeletedRecord', () => {
    it('re-inserts row_data into source_table and marks the entry restored', async () => {
      queueFromResults(
        {
          data: {
            id: 'archive-1',
            source_table: 'pets',
            record_id: 'pet-1',
            row_data: { id: 'pet-1', name: 'Buddy' },
            restored_at: null,
          },
          error: null,
        },
        { data: null, error: null },
        {
          data: {
            id: 'archive-1',
            source_table: 'pets',
            record_id: 'pet-1',
            row_data: { id: 'pet-1', name: 'Buddy' },
            restored_at: '2026-09-14T00:00:00.000Z',
            restored_by: 'admin-1',
          },
          error: null,
        }
      );

      const result = await restoreDeletedRecord('archive-1', 'admin-1');

      expect(result.restored_by).toBe('admin-1');
    });

    it('rejects restoring an entry that was already restored', async () => {
      queueFromResults({
        data: {
          id: 'archive-1',
          source_table: 'pets',
          row_data: { id: 'pet-1' },
          restored_at: '2026-09-10T00:00:00.000Z',
        },
        error: null,
      });

      await expect(
        restoreDeletedRecord('archive-1', 'admin-1')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('404s when the archive entry does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        restoreDeletedRecord('missing', 'admin-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('surfaces a constraint failure from the destination table as a 400', async () => {
      queueFromResults(
        {
          data: {
            id: 'archive-1',
            source_table: 'pets',
            row_data: { id: 'pet-1' },
            restored_at: null,
          },
          error: null,
        },
        { data: null, error: { message: 'duplicate key value' } }
      );

      await expect(
        restoreDeletedRecord('archive-1', 'admin-1')
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('purgeDeletedRecord', () => {
    it('deletes the archive entry', async () => {
      queueFromResults({ data: null, error: null });

      await expect(purgeDeletedRecord('archive-1')).resolves.toBeUndefined();
    });

    it('propagates a delete error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(purgeDeletedRecord('archive-1')).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
