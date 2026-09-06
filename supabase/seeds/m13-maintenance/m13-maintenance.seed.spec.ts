import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedGoldenPackage,
  seedPromos,
  seedServiceBranchAvailability,
  PROMO_SEEDS,
} from './m13-maintenance.seed.ts';

const GOLDEN_PACKAGE_SERVICE_IDS = [
  'a1300000-0000-4000-a000-000000000001',
  'a1300000-0000-4000-a000-000000000002',
  'a1300000-0000-4000-a000-000000000003',
];

interface PromoRow {
  id: string;
  name: string;
  discount_type: string;
  value: number;
  scope_type: string;
  condition_note: string;
  is_active: boolean;
}

function createMockSupabase() {
  const state = {
    services: GOLDEN_PACKAGE_SERVICE_IDS.map((id) => ({ id })),
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    availability: new Map<string, { is_available: boolean }>(),
    packages: new Map<string, { id: string; name: string }>(),
    packageBranchAvailability: new Map<string, Set<string>>(),
    packageServices: new Map<string, Set<string>>(),
    promos: new Map<string, PromoRow>(),
    promoBranchAvailability: [] as Array<{
      promo_id: string;
      branch_id: string;
      is_available: boolean;
    }>,
  };

  let packageCounter = 0;
  let promoSeq = 0;

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
            eq: (_c: string, name: string) => ({
              maybeSingle: () => {
                const found = [...state.packages.values()].find(
                  (p) => p.name === name
                );
                return Promise.resolve({ data: found ?? null, error: null });
              },
            }),
          }),
          insert: (row: { name: string; use_pricing_matrix: boolean }) => {
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

      if (table === 'package_branch_availability') {
        return {
          select: () => ({
            eq: (_c: string, packageId: string) =>
              Promise.resolve({
                data: [
                  ...(state.packageBranchAvailability.get(packageId) ??
                    new Set()),
                ].map((branchId) => ({ branch_id: branchId })),
                error: null,
              }),
          }),
          insert: (
            rows: {
              package_id: string;
              branch_id: string;
              is_available: boolean;
            }[]
          ) => {
            for (const row of rows) {
              const set =
                state.packageBranchAvailability.get(row.package_id) ??
                new Set<string>();
              set.add(row.branch_id);
              state.packageBranchAvailability.set(row.package_id, set);
            }
            return Promise.resolve({ error: null });
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

      if (table === 'promos') {
        return {
          select: () => ({
            eq: (_c: string, name: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    Array.from(state.promos.values()).find(
                      (p) => p.name === name
                    ) ?? null,
                  error: null,
                }),
            }),
          }),
          insert: (row: Omit<PromoRow, 'id'>) => ({
            select: () => ({
              maybeSingle: () => {
                promoSeq += 1;
                const inserted = { ...row, id: `promo-${promoSeq}` };
                state.promos.set(inserted.id, inserted);
                return Promise.resolve({ data: inserted, error: null });
              },
            }),
          }),
        };
      }

      if (table === 'promo_branch_availability') {
        return {
          select: () => ({
            eq: (_c: string, promoId: string) =>
              Promise.resolve({
                data: state.promoBranchAvailability.filter(
                  (r) => r.promo_id === promoId
                ),
                error: null,
              }),
          }),
          insert: (
            rows: Array<{
              promo_id: string;
              branch_id: string;
              is_available: boolean;
            }>
          ) => {
            state.promoBranchAvailability.push(...rows);
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

describe('m13-maintenance seed', () => {
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
    it('creates one shared Golden Package available at every branch, bundling the three seed services', async () => {
      await seedGoldenPackage(supabase as never);

      // Custom change: packages moved off the old MA22 one-row-per-branch
      // model onto a many-to-many join - the same-named package at Makati
      // and Southwoods is one row, not two.
      expect(supabase.state.packages.size).toBe(1);

      // bundled_price is no longer a seeded/stored value - Epic B (#82/#83)
      // derives it on read from the included services' base_price and the
      // shared package_pricing_configuration discount percentage.
      const [pkg] = [...supabase.state.packages.values()];
      expect(pkg.name).toBe('Golden Package');
      expect(supabase.state.packageServices.get(pkg.id)?.size).toBe(3);
      expect(supabase.state.packageBranchAvailability.get(pkg.id)?.size).toBe(
        supabase.state.branches.length
      );
    });

    it('is idempotent: re-running does not duplicate the package, its availability, or its links', async () => {
      await seedGoldenPackage(supabase as never);
      await seedGoldenPackage(supabase as never);

      expect(supabase.state.packages.size).toBe(1);
      const [pkg] = [...supabase.state.packages.values()];
      expect(supabase.state.packageServices.get(pkg.id)?.size).toBe(3);
      expect(supabase.state.packageBranchAvailability.get(pkg.id)?.size).toBe(
        supabase.state.branches.length
      );
    });
  });

  describe('seedPromos', () => {
    it('creates every planned promo, each available at every branch', async () => {
      await seedPromos(supabase as never);

      expect(supabase.state.promos.size).toBe(PROMO_SEEDS.length);
      expect(supabase.state.promoBranchAvailability.length).toBe(
        PROMO_SEEDS.length * supabase.state.branches.length
      );
      for (const promo of supabase.state.promos.values()) {
        expect(promo.is_active).toBe(true);
        expect(promo.scope_type).toBe('all_services');
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedPromos(supabase as never);
      await seedPromos(supabase as never);

      expect(supabase.state.promos.size).toBe(PROMO_SEEDS.length);
      expect(supabase.state.promoBranchAvailability.length).toBe(
        PROMO_SEEDS.length * supabase.state.branches.length
      );
    });
  });
});
