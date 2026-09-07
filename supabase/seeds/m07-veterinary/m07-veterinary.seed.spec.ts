import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedVetMedicationCatalog,
  seedVetProcedureCatalog,
  VET_MEDICATION_SEEDS,
  VET_PROCEDURE_SEEDS,
} from './m07-veterinary.seed.ts';

const VET_ID = 'vet-1';

function createMockSupabase() {
  const state = {
    vetMedication: [] as Array<{ veterinarian_id: string; name: string }>,
    vetProcedure: [] as Array<{
      veterinarian_id: string;
      procedure_type: string;
      description: string;
    }>,
  };

  const supabase = {
    from: vi.fn((table: string) => {
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

describe('m07-veterinary seed', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
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
