import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiscount,
  getDiscountById,
  listDiscounts,
  setDiscountBranchAvailability,
  updateDiscount,
} from './discounts.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

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
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as BuilderRecord);
    return builder as never;
  });
}

const MANDATED_DISCOUNT = {
  id: 'discount-sc',
  name: 'Senior Citizen Discount',
  is_mandated: true,
  discount_type: 'Percentage',
  value: 20,
  scope_type: 'category',
  scope_service_id: null,
  scope_package_id: null,
  scope_category: 'Veterinary',
  is_active: false,
  discount_branch_availability: [
    {
      discount_id: 'discount-sc',
      branch_id: 'branch-makati',
      is_available: true,
    },
  ],
};

const CUSTOM_DISCOUNT = {
  ...MANDATED_DISCOUNT,
  id: 'discount-custom',
  name: 'Loyalty Discount',
  is_mandated: false,
  value: 10,
};

describe('discounts.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDiscount', () => {
    it('AC-1: creates a custom discount, non-mandated and active (branch_ids is always non-empty), and inserts branch availability', async () => {
      queueFromResults(
        { data: CUSTOM_DISCOUNT, error: null }, // discount insert
        { data: null, error: null }, // availability insert
        { data: CUSTOM_DISCOUNT, error: null } // final getDiscountById
      );

      const result = await createDiscount({
        requesterId: 'admin-1',
        input: {
          branch_ids: ['branch-makati'],
          name: 'Loyalty Discount',
          discount_type: 'Percentage',
          value: 10,
          scope_type: 'category',
          scope_category: 'Veterinary',
        },
      });

      expect(result.id).toBe('discount-custom');

      const insertPayload = builders[0].insert.mock.calls[0][0];
      expect(insertPayload.is_mandated).toBe(false);
      // Custom change (unify active/available): a new discount is always
      // available somewhere (branch_ids requires >= 1), so it starts active -
      // there is no longer a separate "created but switched off" state.
      expect(insertPayload.is_active).toBe(true);
      expect(insertPayload.branch_ids).toBeUndefined();

      const availabilityPayload = builders[1].insert.mock.calls[0][0];
      expect(availabilityPayload).toEqual([
        {
          discount_id: 'discount-custom',
          branch_id: 'branch-makati',
          is_available: true,
        },
      ]);
    });

    it('surfaces an insert failure (e.g. the scope CHECK constraint) as 400', async () => {
      queueFromResults({
        data: null,
        error: { message: 'discounts_scope_matches_type' },
      });

      await expect(
        createDiscount({
          requesterId: 'admin-1',
          input: {
            branch_ids: ['branch-makati'],
            name: 'Broken',
            discount_type: 'Flat',
            value: 50,
            scope_type: 'category',
            scope_category: 'Grooming',
          },
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('updateDiscount', () => {
    it('AC-3: rejects renaming a mandated discount with 400', async () => {
      queueFromResults({ data: MANDATED_DISCOUNT, error: null });

      await expect(
        updateDiscount({
          requesterId: 'admin-1',
          discountId: 'discount-sc',
          updates: { name: 'Totally Not SC Anymore' },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('mandated'),
      });
    });

    it("AC-3: edits a custom discount's value and scope", async () => {
      queueFromResults(
        { data: CUSTOM_DISCOUNT, error: null }, // lookup
        { data: null, error: null }, // update
        {
          data: {
            ...CUSTOM_DISCOUNT,
            value: 15,
            scope_category: 'Grooming',
          },
          error: null,
        } // final getDiscountById
      );

      const result = await updateDiscount({
        requesterId: 'admin-1',
        discountId: 'discount-custom',
        updates: {
          value: 15,
          scope_type: 'category',
          scope_category: 'Grooming',
        },
      });

      expect(result.value).toBe(15);

      // Scope change nulls the other scope columns so the DB CHECK holds.
      const updatePayload = builders[1].update.mock.calls[0][0];
      expect(updatePayload.scope_service_id).toBeNull();
      expect(updatePayload.scope_package_id).toBeNull();
    });

    it('renaming a custom discount is allowed', async () => {
      queueFromResults(
        { data: CUSTOM_DISCOUNT, error: null }, // lookup
        { data: null, error: null }, // update
        { data: { ...CUSTOM_DISCOUNT, name: 'VIP Discount' }, error: null } // final getDiscountById
      );

      const result = await updateDiscount({
        requesterId: 'admin-1',
        discountId: 'discount-custom',
        updates: { name: 'VIP Discount' },
      });

      expect(result.name).toBe('VIP Discount');
    });

    it('returns 404 for an unknown discount', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateDiscount({
          requesterId: 'admin-1',
          discountId: 'missing',
          updates: { value: 15 },
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('setDiscountBranchAvailability', () => {
    it('upserts an availability row for an existing discount', async () => {
      queueFromResults(
        { data: { id: 'discount-custom' }, error: null }, // existence lookup
        {
          data: {
            discount_id: 'discount-custom',
            branch_id: 'branch-southwoods',
            is_available: false,
          },
          error: null,
        }, // upsert
        {
          data: [{ is_available: true }, { is_available: false }],
          error: null,
        }, // all-rows read for the is_active sync
        { data: null, error: null } // is_active sync update
      );

      const result = await setDiscountBranchAvailability({
        discountId: 'discount-custom',
        branchId: 'branch-southwoods',
        isAvailable: false,
      });

      expect(result.is_available).toBe(false);
    });

    it('unify active/available: syncs is_active to true when at least one branch stays available', async () => {
      queueFromResults(
        { data: { id: 'discount-custom' }, error: null },
        {
          data: { branch_id: 'branch-makati', is_available: true },
          error: null,
        },
        {
          data: [{ is_available: true }, { is_available: false }],
          error: null,
        },
        { data: null, error: null }
      );

      await setDiscountBranchAvailability({
        discountId: 'discount-custom',
        branchId: 'branch-makati',
        isAvailable: true,
      });

      expect(builders[3].update).toHaveBeenCalledWith({ is_active: true });
    });

    it('unify active/available: syncs is_active to false once every branch is unavailable', async () => {
      queueFromResults(
        { data: { id: 'discount-custom' }, error: null },
        {
          data: { branch_id: 'branch-makati', is_available: false },
          error: null,
        },
        {
          data: [{ is_available: false }, { is_available: false }],
          error: null,
        },
        { data: null, error: null }
      );

      await setDiscountBranchAvailability({
        discountId: 'discount-custom',
        branchId: 'branch-makati',
        isAvailable: false,
      });

      expect(builders[3].update).toHaveBeenCalledWith({ is_active: false });
    });

    it('returns 404 when the discount does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        setDiscountBranchAvailability({
          discountId: 'missing',
          branchId: 'branch-makati',
          isAvailable: true,
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listDiscounts', () => {
    it('AC-4: returns all rows (including inactive) by default, filterable by branch availability', async () => {
      queueFromResults({
        data: [MANDATED_DISCOUNT, CUSTOM_DISCOUNT],
        error: null,
      });

      const result = await listDiscounts({ branchId: 'branch-makati' });

      // Both fixtures are only available at branch-makati.
      expect(result).toHaveLength(2);
      expect(builders[0].eq).not.toHaveBeenCalledWith('is_active', true);
    });

    it('filters out discounts with no available row at the requested branch', async () => {
      queueFromResults({
        data: [MANDATED_DISCOUNT, CUSTOM_DISCOUNT],
        error: null,
      });

      const result = await listDiscounts({ branchId: 'branch-southwoods' });

      expect(result).toHaveLength(0);
    });

    it('activeOnly narrows to enabled discounts', async () => {
      queueFromResults({ data: [], error: null });

      await listDiscounts({ activeOnly: true });

      expect(builders[0].eq).toHaveBeenCalledWith('is_active', true);
    });
  });

  describe('getDiscountById', () => {
    it('returns 404 when the id does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(getDiscountById('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
