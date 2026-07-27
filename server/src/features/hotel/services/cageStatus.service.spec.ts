import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAvailableCageCountsBySize,
  getCageGrid,
  setCageMaintenanceStatus,
} from './cageStatus.service.ts';
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

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq', 'order', 'update']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('cageStatus.service (#78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCageGrid', () => {
    it('AC-1: groups cages by size category', async () => {
      queueFromResults({
        data: [
          { id: 'c1', size: 'S', status: 'Available' },
          { id: 'c2', size: 'M', status: 'Occupied' },
        ],
        error: null,
      });

      const grid = await getCageGrid('branch-1');

      expect(grid.S).toHaveLength(1);
      expect(grid.M).toHaveLength(1);
      expect(grid.L).toHaveLength(0);
      expect(grid.XL).toHaveLength(0);
    });
  });

  describe('getAvailableCageCountsBySize', () => {
    it('AC-1: excludes Under Maintenance and Occupied cages (query already filters status = Available)', async () => {
      queueFromResults({
        data: [{ size: 'S' }, { size: 'S' }, { size: 'M' }],
        error: null,
      });

      const counts = await getAvailableCageCountsBySize('branch-1');

      expect(counts).toEqual({ S: 2, M: 1, L: 0, XL: 0 });
    });
  });

  describe('setCageMaintenanceStatus', () => {
    it('AC-2: an Available cage can be set to Under Maintenance', async () => {
      queueFromResults({
        data: { id: 'c1', status: 'Under Maintenance' },
        error: null,
      });

      const cage = await setCageMaintenanceStatus(
        'c1',
        'branch-1',
        'Under Maintenance'
      );
      expect(cage.status).toBe('Under Maintenance');
    });

    it('AC-2: rejects setting a currently-Occupied cage to Under Maintenance', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        setCageMaintenanceStatus('c1', 'branch-1', 'Under Maintenance')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('AC-2: an Under Maintenance cage can be reset to Available', async () => {
      queueFromResults({
        data: { id: 'c1', status: 'Available' },
        error: null,
      });

      const cage = await setCageMaintenanceStatus(
        'c1',
        'branch-1',
        'Available'
      );
      expect(cage.status).toBe('Available');
    });
  });
});
