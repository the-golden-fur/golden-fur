import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedMandatedDiscounts } from './m12-discounts.seed.ts';

function createMockSupabase() {
  const state = {
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    discounts: new Map<
      string,
      {
        id: string;
        name: string;
        is_mandated: boolean;
        value: number;
        scope_category: string;
        is_active: boolean;
      }
    >(),
    discountBranchAvailability: new Map<string, Set<string>>(),
  };

  let discountCounter = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'branches') {
        return {
          select: () => Promise.resolve({ data: state.branches, error: null }),
        };
      }

      if (table === 'discounts') {
        return {
          select: () => ({
            eq: (_c1: string, name: string) => ({
              eq: (_c2: string, category: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.discounts.get(`${name}:${category}`) ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: {
            name: string;
            is_mandated: boolean;
            value: number;
            scope_category: string;
            is_active: boolean;
          }) => {
            discountCounter += 1;
            const created = { id: `discount-${discountCounter}`, ...row };
            state.discounts.set(`${row.name}:${row.scope_category}`, created);
            return {
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: created, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'discount_branch_availability') {
        return {
          insert: (
            rows: {
              discount_id: string;
              branch_id: string;
              is_available: boolean;
            }[]
          ) => {
            for (const row of rows) {
              const set =
                state.discountBranchAvailability.get(row.discount_id) ??
                new Set<string>();
              set.add(row.branch_id);
              state.discountBranchAvailability.set(row.discount_id, set);
            }
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
    state,
  };

  return supabase;
}

describe('m12-discounts seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('seedMandatedDiscounts', () => {
    it('AC-3: creates Senior Citizen + PWD per category, each available at every branch, active', async () => {
      await seedMandatedDiscounts(supabase as never);

      // Custom change: one row per discount name x category (2 x 4 = 8),
      // not per branch - see migration 20260820140. Each row still gets an
      // availability row per branch.
      expect(supabase.state.discounts.size).toBe(8);

      for (const discount of supabase.state.discounts.values()) {
        expect(discount.is_mandated).toBe(true);
        // Custom change (unify active/available): is_active mirrors branch
        // availability everywhere now - every row here is seeded available
        // at every branch, so it's seeded active too.
        expect(discount.is_active).toBe(true);
        expect(Number(discount.value)).toBe(20);
        expect(
          supabase.state.discountBranchAvailability.get(discount.id)?.size
        ).toBe(supabase.state.branches.length);
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedMandatedDiscounts(supabase as never);
      await seedMandatedDiscounts(supabase as never);

      expect(supabase.state.discounts.size).toBe(8);
    });
  });
});
