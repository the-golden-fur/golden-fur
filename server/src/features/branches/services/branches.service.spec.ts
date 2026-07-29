import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBranch,
  listBranchesFull,
  updateBranch,
} from './branches.service.ts';
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
    builder.update = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const BRANCH = {
  id: 'branch-1',
  name: 'Makati',
  address: '123 Ayala Ave',
  contact_number: '0917-000-0000',
  is_vet_branch: true,
  operating_hours: { monday: { open: '08:00', close: '18:00' } },
  timezone: 'Asia/Manila',
  created_at: '2026-06-25T00:00:00.000Z',
};

describe('branches.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listBranchesFull', () => {
    it('returns every branch row', async () => {
      queueFromResults({ data: [BRANCH], error: null });

      const result = await listBranchesFull();

      expect(result).toEqual([BRANCH]);
    });
  });

  describe('getBranch', () => {
    it('returns the requested branch', async () => {
      queueFromResults({ data: BRANCH, error: null });

      const result = await getBranch('branch-1');

      expect(result).toEqual(BRANCH);
    });

    it('returns 404 when the branch does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getBranch('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('updateBranch', () => {
    it('updates and returns the branch', async () => {
      queueFromResults({
        data: { ...BRANCH, address: '456 Makati Ave' },
        error: null,
      });

      const result = await updateBranch('branch-1', {
        address: '456 Makati Ave',
      });

      expect(result.address).toBe('456 Makati Ave');
    });

    it('translates a unique-name violation into a 409', async () => {
      queueFromResults({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        updateBranch('branch-1', { name: 'Southwoods' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('returns 404 when the branch does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateBranch('missing', { address: 'New address' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
