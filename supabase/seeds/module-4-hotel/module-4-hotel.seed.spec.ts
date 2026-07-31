import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedCages,
  seedFoodCatalog,
  seedMedicationCatalog,
} from './module-4-hotel.seed.ts';

interface ProductCatalogRow {
  name: string;
  price: number;
  category: string;
  service_scope: string;
}

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
    // Sprint 5 unification (#82): both catalogs now write into the same
    // product_catalog table, keyed here by `${category}:${name}` to mirror
    // the table's real (name, category) uniqueness.
    productCatalog: new Map<string, ProductCatalogRow>(),
  };

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

      if (table === 'product_catalog') {
        return {
          select: () => ({
            eq: (_c1: string, name: string) => ({
              eq: (_c2: string, category: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      state.productCatalog.get(`${category}:${name}`) ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: ProductCatalogRow) => {
            state.productCatalog.set(`${row.category}:${row.name}`, row);
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

function catalogSize(
  productCatalog: Map<string, ProductCatalogRow>,
  category: string
) {
  return Array.from(productCatalog.values()).filter(
    (row) => row.category === category
  ).length;
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
    it('creates every planned food catalog item with a price, category, and service_scope', async () => {
      await seedFoodCatalog(supabase as never);

      const foodRows = Array.from(
        supabase.state.productCatalog.values()
      ).filter((row) => row.category === 'food');
      expect(foodRows.length).toBeGreaterThan(0);
      for (const item of foodRows) {
        expect(typeof item.price).toBe('number');
        expect(item.service_scope).toBe('hotel');
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedFoodCatalog(supabase as never);
      const firstCount = catalogSize(supabase.state.productCatalog, 'food');
      await seedFoodCatalog(supabase as never);

      expect(catalogSize(supabase.state.productCatalog, 'food')).toBe(
        firstCount
      );
    });
  });

  describe('seedMedicationCatalog', () => {
    it('creates every planned medication catalog item with a price, category, and service_scope', async () => {
      await seedMedicationCatalog(supabase as never);

      const medicationRows = Array.from(
        supabase.state.productCatalog.values()
      ).filter((row) => row.category === 'medication');
      expect(medicationRows.length).toBeGreaterThan(0);
      for (const item of medicationRows) {
        expect(typeof item.price).toBe('number');
        expect(item.service_scope).toBe('hotel');
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedMedicationCatalog(supabase as never);
      const firstCount = catalogSize(
        supabase.state.productCatalog,
        'medication'
      );
      await seedMedicationCatalog(supabase as never);

      expect(catalogSize(supabase.state.productCatalog, 'medication')).toBe(
        firstCount
      );
    });
  });
});
