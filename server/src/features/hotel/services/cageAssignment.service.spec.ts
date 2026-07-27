import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignCage,
  releaseCage,
  suggestCage,
} from './cageAssignment.service.ts';
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

    for (const method of ['select', 'eq', 'update']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

describe('cageAssignment.service (#75)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('suggestCage', () => {
    it('AC-2: returns the pet weight-class-matching size and its Available cages', async () => {
      queueFromResults(
        { data: { weight_class: 'M' }, error: null },
        {
          data: [{ id: 'cage-1', size: 'M', status: 'Available' }],
          error: null,
        }
      );

      const result = await suggestCage('pet-1', 'branch-1');

      expect(result.suggestedSize).toBe('M');
      expect(result.availableCages).toHaveLength(1);
    });

    it('404s when the pet does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(suggestCage('pet-x', 'branch-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('assignCage', () => {
    it('AC-2/AC-4: claims an Available cage, flipping it to Occupied', async () => {
      queueFromResults({
        data: { id: 'cage-1', status: 'Occupied' },
        error: null,
      });

      const cage = await assignCage('cage-1', 'branch-1');
      expect(cage.status).toBe('Occupied');
    });

    it('AC-2: rejects a cage that is not Available (already Occupied or Under Maintenance)', async () => {
      queueFromResults({ data: null, error: null });

      await expect(assignCage('cage-1', 'branch-1')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('releaseCage', () => {
    it('sets the cage back to Available', async () => {
      queueFromResults({ data: { id: 'cage-1' }, error: null });
      await expect(releaseCage('cage-1')).resolves.toBeUndefined();
    });
  });
});
