import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedPromos,
  seedVetMedicationCatalog,
  seedVetProcedureCatalog,
  PROMO_SEEDS,
  VET_MEDICATION_SEEDS,
  VET_PROCEDURE_SEEDS,
} from './module-5-promos-vet-catalog.seed.ts';

const VET_ID = 'vet-1';

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
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    promos: new Map<string, PromoRow>(),
    promoBranchAvailability: [] as Array<{
      promo_id: string;
      branch_id: string;
      is_available: boolean;
    }>,
    vetMedication: [] as Array<{ veterinarian_id: string; name: string }>,
    vetProcedure: [] as Array<{
      veterinarian_id: string;
      procedure_type: string;
      description: string;
    }>,
  };

  let promoSeq = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'branches') {
        return {
          select: () => Promise.resolve({ data: state.branches, error: null }),
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

      if (table === 'vet_medication_catalog') {
        return {
          select: () => ({
            eq: (_c1: string, vetId: string) => ({
              eq: (_c2: string, name: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      state.vetMedication.find(
                        (r) => r.veterinarian_id === vetId && r.name === name
                      ) ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: { veterinarian_id: string; name: string }) => {
            state.vetMedication.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'vet_procedure_catalog') {
        return {
          select: () => ({
            eq: (_c1: string, vetId: string) => ({
              eq: (_c2: string, procedureType: string) => ({
                eq: (_c3: string, description: string) => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data:
                        state.vetProcedure.find(
                          (r) =>
                            r.veterinarian_id === vetId &&
                            r.procedure_type === procedureType &&
                            r.description === description
                        ) ?? null,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
          insert: (row: {
            veterinarian_id: string;
            procedure_type: string;
            description: string;
          }) => {
            state.vetProcedure.push(row);
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

describe('module-5-promos-vet-catalog seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('seedPromos', () => {
    it('creates every planned promo, each available at every branch', async () => {
      await seedPromos(supabase as never);

      expect(supabase.state.promos.size).toBe(PROMO_SEEDS.length);
      expect(supabase.state.promoBranchAvailability.length).toBe(
        PROMO_SEEDS.length * 2
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
        PROMO_SEEDS.length * 2
      );
    });
  });

  describe('seedVetMedicationCatalog / seedVetProcedureCatalog', () => {
    it('creates every planned catalog item for the given veterinarian', async () => {
      await seedVetMedicationCatalog(supabase as never, VET_ID);
      await seedVetProcedureCatalog(supabase as never, VET_ID);

      expect(supabase.state.vetMedication.length).toBe(
        VET_MEDICATION_SEEDS.length
      );
      expect(supabase.state.vetProcedure.length).toBe(
        VET_PROCEDURE_SEEDS.length
      );
      for (const row of supabase.state.vetMedication) {
        expect(row.veterinarian_id).toBe(VET_ID);
      }
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await seedVetMedicationCatalog(supabase as never, VET_ID);
      await seedVetMedicationCatalog(supabase as never, VET_ID);
      await seedVetProcedureCatalog(supabase as never, VET_ID);
      await seedVetProcedureCatalog(supabase as never, VET_ID);

      expect(supabase.state.vetMedication.length).toBe(
        VET_MEDICATION_SEEDS.length
      );
      expect(supabase.state.vetProcedure.length).toBe(
        VET_PROCEDURE_SEEDS.length
      );
    });
  });
});
