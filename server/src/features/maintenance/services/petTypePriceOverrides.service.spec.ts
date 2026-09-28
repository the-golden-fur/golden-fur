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
    builder.not = vi.fn(() => builder);
    builder.in = builder.in ?? vi.fn(() => builder);
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
        { data: [], error: null }, // archived pet type check
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
        input: { pet_type: 'Cat', branch_id: null, fixed_price: 800 },
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-1',
      });

      expect(result.fixed_price).toBe(800);
    });

    it('updates the existing row for that exact scope when one already exists', async () => {
      queueFromResults(
        { data: [], error: null }, // archived pet type check
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
        input: { pet_type: 'Cat', branch_id: null, fixed_price: 900 },
        requesterRole: 'Superadmin',
        requesterBranchId: 'branch-1',
      });

      expect(result.fixed_price).toBe(900);
    });

    it('creates a branch-specific override when the requesting Admin owns that branch', async () => {
      queueFromResults(
        { data: [], error: null }, // archived pet type check
        { data: null, error: null }, // existing-row lookup: none found
        {
          data: {
            id: 'override-2',
            pet_type: 'Cat',
            branch_id: 'branch-1',
            fixed_price: 950,
          },
          error: null,
        } // insert
      );

      const result = await upsertPetTypePriceOverride({
        input: { pet_type: 'Cat', branch_id: 'branch-1', fixed_price: 950 },
        requesterRole: 'Admin',
        requesterBranchId: 'branch-1',
      });

      expect(result.fixed_price).toBe(950);
    });

    it('rejects an Admin trying to set an override for another branch', async () => {
      await expect(
        upsertPetTypePriceOverride({
          input: { pet_type: 'Cat', branch_id: 'branch-2', fixed_price: 950 },
          requesterRole: 'Admin',
          requesterBranchId: 'branch-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects an Admin trying to set the system-wide default override', async () => {
      await expect(
        upsertPetTypePriceOverride({
          input: { pet_type: 'Cat', branch_id: null, fixed_price: 950 },
          requesterRole: 'Admin',
          requesterBranchId: 'branch-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('deletePetTypePriceOverride', () => {
    it('deletes an override row (Superadmin, no ownership lookup needed)', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        deletePetTypePriceOverride({
          overrideId: 'override-1',
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-1',
        })
      ).resolves.toBeUndefined();
    });

    it('propagates a query error as a 400', async () => {
      queueFromResults({ data: null, error: { message: 'boom' } });

      await expect(
        deletePetTypePriceOverride({
          overrideId: 'override-1',
          requesterRole: 'Superadmin',
          requesterBranchId: 'branch-1',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('allows an Admin to delete an override row for their own branch', async () => {
      queueFromResults(
        { data: { branch_id: 'branch-1' }, error: null }, // ownership lookup
        { data: null, error: null } // delete
      );

      await expect(
        deletePetTypePriceOverride({
          overrideId: 'override-1',
          requesterRole: 'Admin',
          requesterBranchId: 'branch-1',
        })
      ).resolves.toBeUndefined();
    });

    it('rejects an Admin trying to delete an override row for another branch', async () => {
      queueFromResults({ data: { branch_id: 'branch-2' }, error: null }); // ownership lookup

      await expect(
        deletePetTypePriceOverride({
          overrideId: 'override-1',
          requesterRole: 'Admin',
          requesterBranchId: 'branch-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects an Admin trying to delete the system-wide default override', async () => {
      queueFromResults({ data: { branch_id: null }, error: null }); // ownership lookup

      await expect(
        deletePetTypePriceOverride({
          overrideId: 'override-1',
          requesterRole: 'Admin',
          requesterBranchId: 'branch-1',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
