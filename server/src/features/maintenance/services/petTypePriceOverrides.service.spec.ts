import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deletePetTypePriceOverride,
  getFixedPrice,
  listPetTypePriceOverrides,
  upsertPetTypePriceOverride,
} from './petTypePriceOverrides.service.ts';
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
    builder.or = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('petTypePriceOverrides.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPetTypePriceOverrides', () => {
    it('returns only the default rows when no branch is given', async () => {
      queueFromResults({
        data: [{ id: 'override-1', pet_type: 'Cat', branch_id: null }],
        error: null,
      });

      const result = await listPetTypePriceOverrides({});

      expect(result).toHaveLength(1);
    });

    it('returns default and branch-specific rows when a branch is given', async () => {
      queueFromResults({
        data: [
          { id: 'override-1', pet_type: 'Cat', branch_id: null },
          { id: 'override-2', pet_type: 'Cat', branch_id: 'branch-1' },
        ],
        error: null,
      });

      const result = await listPetTypePriceOverrides({
        branchId: 'branch-1',
      });

      expect(result).toHaveLength(2);
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(listPetTypePriceOverrides({})).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('getFixedPrice', () => {
    it('returns the branch-specific override when one exists, over the default', async () => {
      queueFromResults({
        data: [
          { branch_id: null, fixed_price: 800 },
          { branch_id: 'branch-1', fixed_price: 950 },
        ],
        error: null,
      });

      const result = await getFixedPrice('Cat', 'branch-1');

      expect(result).toBe(950);
    });

    it('falls back to the system-wide default row when no branch-specific row exists', async () => {
      queueFromResults({
        data: [{ branch_id: null, fixed_price: 800 }],
        error: null,
      });

      const result = await getFixedPrice('Cat', 'branch-1');

      expect(result).toBe(800);
    });

    it('returns null when no override row exists at all', async () => {
      queueFromResults({ data: [], error: null });

      const result = await getFixedPrice('Dog', 'branch-1');

      expect(result).toBeNull();
    });
  });

  describe('upsertPetTypePriceOverride', () => {
    it('creates a new default-row override when none exists yet', async () => {
      queueFromResults(
        { data: null, error: null }, // existing-row lookup: none found
        {
          data: {
            id: 'override-1',
            pet_type: 'Cat',
            branch_id: null,
            fixed_price: 800,
          },
          error: null,
        } // insert
      );

      const result = await upsertPetTypePriceOverride({
        pet_type: 'Cat',
        branch_id: null,
        fixed_price: 800,
      });

      expect(result.fixed_price).toBe(800);
    });

    it('updates the existing row for that exact scope when one already exists', async () => {
      queueFromResults(
        { data: { id: 'override-1' }, error: null }, // existing-row lookup: found
        {
          data: {
            id: 'override-1',
            pet_type: 'Cat',
            branch_id: null,
            fixed_price: 900,
          },
          error: null,
        } // update
      );

      const result = await upsertPetTypePriceOverride({
        pet_type: 'Cat',
        branch_id: null,
        fixed_price: 900,
      });

      expect(result.fixed_price).toBe(900);
    });
  });

  describe('deletePetTypePriceOverride', () => {
    it('deletes an override row', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        deletePetTypePriceOverride('override-1')
      ).resolves.toBeUndefined();
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(
        deletePetTypePriceOverride('override-1')
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
