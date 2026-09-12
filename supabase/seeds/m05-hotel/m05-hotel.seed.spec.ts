import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedCages,
  seedFoodCatalog,
  seedMedicationCatalog,
} from './m05-hotel.seed.ts';

interface ProductCatalogRow {
  name: string;
  price: number;
  category: string;
  service_scope: string;
  owner_customer_id: string;
}

const OWNER_CUSTOMER_ID = 'customer-1';

function createMockSupabase() {
  const state = {
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    cages: new Map<
      string,
      {
        id: string;
        branch_id: string;
        cage_label: string;
        size: string;
        status: string;
      }
    >(),
    // Custom change (cage pet-type support, 20260912193), keyed by
    // `${cage_id}:${pet_type}` to mirror the real table's composite PK.
    cagePetTypes: new Map<string, { cage_id: string; pet_type: string }>(),
    // Sprint 5 unification (#82): both catalogs now write into the same
    // product_catalog table, keyed here by `${owner}:${category}:${name}` to
    // mirror the table's real (owner_customer_id, name, category) partial
    // uniqueness (20260803085).
    productCatalog: new Map<string, ProductCatalogRow>(),
  };

  let nextCageId = 1;

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
            const id = `cage-${nextCageId++}`;
            const stored = { id, ...row };
            state.cages.set(`${row.branch_id}:${row.cage_label}`, stored);
            return {
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id }, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'cage_pet_types') {
        return {
          select: () => ({
            eq: (_c1: string, cageId: string) => ({
              then: (
                resolve: (_result: {
                  data: { pet_type: string }[];
                  error: null;
                }) => void
              ) =>
                resolve({
                  data: Array.from(state.cagePetTypes.values())
                    .filter((row) => row.cage_id === cageId)
                    .map((row) => ({ pet_type: row.pet_type })),
                  error: null,
                }),
            }),
          }),
          insert: (rows: { cage_id: string; pet_type: string }[]) => {
            for (const row of rows) {
              state.cagePetTypes.set(`${row.cage_id}:${row.pet_type}`, row);
            }
            return Promise.resolve({ error: null });
          },
          delete: () => ({
            eq: (_c1: string, cageId: string) => ({
              eq: (_c2: string, petType: string) => {
                state.cagePetTypes.delete(`${cageId}:${petType}`);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }

      if (table === 'product_catalog') {
        return {
          select: () => ({
            eq: (_c1: string, ownerCustomerId: string) => ({
              eq: (_c2: string, name: string) => ({
                eq: (_c3: string, category: string) => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data:
                        state.productCatalog.get(
                          `${ownerCustomerId}:${category}:${name}`
                        ) ?? null,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
          insert: (row: ProductCatalogRow) => {
            state.productCatalog.set(
              `${row.owner_customer_id}:${row.category}:${row.name}`,
              row
            );
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

describe('m05-hotel seed', () => {
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

    it('Custom change (cage pet-type support): assigns the planned pet types per cage, e.g. S-02 is Cat-only and XL-01 is Dog-only', async () => {
      await seedCages(supabase as never);

      function petTypesFor(branchId: string, cageLabel: string): string[] {
        const cage = supabase.state.cages.get(`${branchId}:${cageLabel}`)!;
        return Array.from(supabase.state.cagePetTypes.values())
          .filter((row) => row.cage_id === cage.id)
          .map((row) => row.pet_type)
          .sort();
      }

      expect(petTypesFor('branch-makati', 'Makati-S-01')).toEqual([
        'Cat',
        'Dog',
      ]);
      expect(petTypesFor('branch-makati', 'Makati-S-02')).toEqual(['Cat']);
      expect(petTypesFor('branch-makati', 'Makati-M-02')).toEqual(['Dog']);
      expect(petTypesFor('branch-makati', 'Makati-XL-01')).toEqual(['Dog']);
    });

    it('Custom change (cage pet-type support): re-running does not duplicate cage_pet_types rows', async () => {
      await seedCages(supabase as never);
      const firstCount = supabase.state.cagePetTypes.size;
      await seedCages(supabase as never);

      expect(supabase.state.cagePetTypes.size).toBe(firstCount);
    });
  });

  describe('seedFoodCatalog', () => {
    it('creates every planned food catalog item owned by the given customer, with a price, category, and service_scope', async () => {
      await seedFoodCatalog(supabase as never, OWNER_CUSTOMER_ID);

      const foodRows = Array.from(
        supabase.state.productCatalog.values()
      ).filter((row) => row.category === 'food');
      expect(foodRows.length).toBeGreaterThan(0);
      for (const item of foodRows) {
        expect(typeof item.price).toBe('number');
        expect(item.service_scope).toBe('hotel');
        expect(item.owner_customer_id).toBe(OWNER_CUSTOMER_ID);
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedFoodCatalog(supabase as never, OWNER_CUSTOMER_ID);
      const firstCount = catalogSize(supabase.state.productCatalog, 'food');
      await seedFoodCatalog(supabase as never, OWNER_CUSTOMER_ID);

      expect(catalogSize(supabase.state.productCatalog, 'food')).toBe(
        firstCount
      );
    });
  });

  describe('seedMedicationCatalog', () => {
    it('creates every planned medication catalog item owned by the given customer, with a price, category, and service_scope', async () => {
      await seedMedicationCatalog(supabase as never, OWNER_CUSTOMER_ID);

      const medicationRows = Array.from(
        supabase.state.productCatalog.values()
      ).filter((row) => row.category === 'medication');
      expect(medicationRows.length).toBeGreaterThan(0);
      for (const item of medicationRows) {
        expect(typeof item.price).toBe('number');
        expect(item.service_scope).toBe('hotel');
        expect(item.owner_customer_id).toBe(OWNER_CUSTOMER_ID);
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedMedicationCatalog(supabase as never, OWNER_CUSTOMER_ID);
      const firstCount = catalogSize(
        supabase.state.productCatalog,
        'medication'
      );
      await seedMedicationCatalog(supabase as never, OWNER_CUSTOMER_ID);

      expect(catalogSize(supabase.state.productCatalog, 'medication')).toBe(
        firstCount
      );
    });
  });
});
