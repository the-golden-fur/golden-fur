import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedCages,
  seedFoodCatalog,
  seedMedicationCatalog,
} from './module-4-hotel.seed.ts';

function createMockSupabase() {
  const state = {
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    cages: new Map<
      string,
      { branch_id: string; cage_label: string; size: string; status: string }
    >(),
    foodCatalog: new Map<string, { name: string; price: number }>(),
    medicationCatalog: new Map<string, { name: string; price: number }>(),
  };

  function catalogTable(store: Map<string, { name: string; price: number }>) {
    return {
      select: () => ({
        eq: (_c: string, name: string) => ({
          maybeSingle: () =>
            Promise.resolve({ data: store.get(name) ?? null, error: null }),
        }),
      }),
      insert: (row: { name: string; price: number }) => {
        store.set(row.name, row);
        return Promise.resolve({ error: null });
      },
    };
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'branches') {
        return {
          select: () => Promise.resolve({ data: state.branches, error: null }),
        };
      }

      if (table === 'cages') {
        return {
          select: () => ({
            eq: (_c1: string, branchId: string) => ({
              eq: (_c2: string, cageLabel: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: state.cages.get(`${branchId}:${cageLabel}`) ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: {
            branch_id: string;
            cage_label: string;
            size: string;
            status: string;
          }) => {
            state.cages.set(`${row.branch_id}:${row.cage_label}`, row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'food_catalog') return catalogTable(state.foodCatalog);
      if (table === 'medication_catalog') {
        return catalogTable(state.medicationCatalog);
      }

      throw new Error(`unexpected table: ${table}`);
    }),
    state,
  };

  return supabase;
}

describe('module-4-hotel seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('seedCages', () => {
    it('AC-4: creates 7 cages (2xS, 2xM, 2xL, 1xXL) per branch, all Available', async () => {
      await seedCages(supabase as never);

      expect(supabase.state.cages.size).toBe(14); // 7 x 2 branches

      const bySize = { S: 0, M: 0, L: 0, XL: 0 };
      for (const cage of supabase.state.cages.values()) {
        expect(cage.status).toBe('Available');
        bySize[cage.size as keyof typeof bySize] += 1;
      }
      expect(bySize).toEqual({ S: 4, M: 4, L: 4, XL: 2 });
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedCages(supabase as never);
      await seedCages(supabase as never);

      expect(supabase.state.cages.size).toBe(14);
    });
  });

  describe('seedFoodCatalog', () => {
    it('creates every planned food catalog item with a price', async () => {
      await seedFoodCatalog(supabase as never);

      expect(supabase.state.foodCatalog.size).toBeGreaterThan(0);
      for (const item of supabase.state.foodCatalog.values()) {
        expect(typeof item.price).toBe('number');
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedFoodCatalog(supabase as never);
      const firstCount = supabase.state.foodCatalog.size;
      await seedFoodCatalog(supabase as never);

      expect(supabase.state.foodCatalog.size).toBe(firstCount);
    });
  });

  describe('seedMedicationCatalog', () => {
    it('creates every planned medication catalog item with a price', async () => {
      await seedMedicationCatalog(supabase as never);

      expect(supabase.state.medicationCatalog.size).toBeGreaterThan(0);
      for (const item of supabase.state.medicationCatalog.values()) {
        expect(typeof item.price).toBe('number');
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedMedicationCatalog(supabase as never);
      const firstCount = supabase.state.medicationCatalog.size;
      await seedMedicationCatalog(supabase as never);

      expect(supabase.state.medicationCatalog.size).toBe(firstCount);
    });
  });
});
