import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedGoldenPackage,
  seedMandatedDiscounts,
  seedServiceBranchAvailability,
} from './module-3-maintenance.seed.ts';

const GOLDEN_PACKAGE_SERVICE_IDS = [
  'a1300000-0000-4000-a000-000000000001',
  'a1300000-0000-4000-a000-000000000002',
  'a1300000-0000-4000-a000-000000000003',
];

function createMockSupabase() {
  const state = {
    services: GOLDEN_PACKAGE_SERVICE_IDS.map((id) => ({ id })),
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    availability: new Map<string, { is_available: boolean }>(),
    packages: new Map<string, { id: string; branch_id: string; name: string }>(),
    packageServices: new Map<string, Set<string>>(),
    discounts: new Map<
      string,
      {
        branch_id: string;
        name: string;
        is_mandated: boolean;
        value: number;
        scope_category: string;
        is_active: boolean;
      }
    >(),
  };

  let packageCounter = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'services') {
        return {
          select: () => ({
            like: () => Promise.resolve({ data: state.services, error: null }),
          }),
        };
      }

      if (table === 'branches') {
        return {
          select: () => Promise.resolve({ data: state.branches, error: null }),
        };
      }

      if (table === 'service_branch_availability') {
        return {
          select: () => ({
            eq: (_c1: string, serviceId: string) => ({
              eq: (_c2: string, branchId: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      state.availability.get(`${serviceId}:${branchId}`) ??
                      null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: {
            service_id: string;
            branch_id: string;
            is_available: boolean;
          }) => {
            state.availability.set(`${row.service_id}:${row.branch_id}`, {
              is_available: row.is_available,
            });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'packages') {
        return {
          select: () => ({
            eq: (_c1: string, branchId: string) => ({
              eq: (_c2: string, name: string) => ({
                maybeSingle: () => {
                  const found = [...state.packages.values()].find(
                    (p) => p.branch_id === branchId && p.name === name
                  );
                  return Promise.resolve({ data: found ?? null, error: null });
                },
              }),
            }),
          }),
          insert: (row: { branch_id: string; name: string }) => {
            packageCounter += 1;
            const created = { id: `package-${packageCounter}`, ...row };
            state.packages.set(created.id, created);
            return {
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: created, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'package_services') {
        return {
          select: () => ({
            eq: (_c: string, packageId: string) =>
              Promise.resolve({
                data: [
                  ...(state.packageServices.get(packageId) ?? new Set()),
                ].map((serviceId) => ({ service_id: serviceId })),
                error: null,
              }),
          }),
          insert: (rows: { package_id: string; service_id: string }[]) => {
            for (const row of rows) {
              const set =
                state.packageServices.get(row.package_id) ?? new Set<string>();
              set.add(row.service_id);
              state.packageServices.set(row.package_id, set);
            }
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'discounts') {
        return {
          select: () => ({
            eq: (_c1: string, branchId: string) => ({
              eq: (_c2: string, name: string) => ({
                eq: (_c3: string, category: string) => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data:
                        state.discounts.get(
                          `${branchId}:${name}:${category}`
                        ) ?? null,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
          insert: (row: {
            branch_id: string;
            name: string;
            is_mandated: boolean;
            value: number;
            scope_category: string;
            is_active: boolean;
          }) => {
            state.discounts.set(
              `${row.branch_id}:${row.name}:${row.scope_category}`,
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

describe('module-3-maintenance seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('seedServiceBranchAvailability', () => {
    it('creates an available row for every service x branch pair', async () => {
      await seedServiceBranchAvailability(supabase as never);

      expect(supabase.state.availability.size).toBe(
        GOLDEN_PACKAGE_SERVICE_IDS.length * supabase.state.branches.length
      );
      for (const row of supabase.state.availability.values()) {
        expect(row.is_available).toBe(true);
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedServiceBranchAvailability(supabase as never);
      await seedServiceBranchAvailability(supabase as never);

      expect(supabase.state.availability.size).toBe(
        GOLDEN_PACKAGE_SERVICE_IDS.length * supabase.state.branches.length
      );
    });
  });

  describe('seedGoldenPackage', () => {
    it('AC-2: creates one Golden Package per branch bundling the three seed services', async () => {
      await seedGoldenPackage(supabase as never);

      expect(supabase.state.packages.size).toBe(2);

      // bundled_price is no longer a seeded/stored value - Epic B (#82/#83)
      // derives it on read from the included services' base_price and the
      // shared package_pricing_configuration discount percentage.
      for (const pkg of supabase.state.packages.values()) {
        expect(pkg.name).toBe('Golden Package');
        expect(supabase.state.packageServices.get(pkg.id)?.size).toBe(3);
      }
    });

    it('is idempotent: re-running does not duplicate packages or links', async () => {
      await seedGoldenPackage(supabase as never);
      await seedGoldenPackage(supabase as never);

      expect(supabase.state.packages.size).toBe(2);
      for (const pkg of supabase.state.packages.values()) {
        expect(supabase.state.packageServices.get(pkg.id)?.size).toBe(3);
      }
    });
  });

  describe('seedMandatedDiscounts', () => {
    it('AC-3: creates Senior Citizen + PWD per branch per category, inactive', async () => {
      await seedMandatedDiscounts(supabase as never);

      // 2 branches x 2 discount names x 4 categories = 16
      expect(supabase.state.discounts.size).toBe(16);

      for (const discount of supabase.state.discounts.values()) {
        expect(discount.is_mandated).toBe(true);
        expect(discount.is_active).toBe(false);
        expect(Number(discount.value)).toBe(20);
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedMandatedDiscounts(supabase as never);
      await seedMandatedDiscounts(supabase as never);

      expect(supabase.state.discounts.size).toBe(16);
    });
  });
});
