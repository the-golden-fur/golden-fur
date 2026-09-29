import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONSULTATION_FORM_TEMPLATE_SEEDS,
  PRESCRIPTION_TEMPLATE_SEEDS,
  seedConsultationFormTemplates,
  seedPrescriptionTemplates,
  seedVetMedicationCatalog,
  VET_MEDICATION_SEEDS,
} from './m07-veterinary.seed.ts';

const VET_ID = 'vet-1';

function createMockSupabase() {
  const state = {
    vetMedication: [] as Array<{
      id: string;
      veterinarian_id: string;
      name: string;
    }>,
    prescriptionTemplates: [] as Array<{
      veterinarian_id: string;
      name: string;
      items: unknown;
    }>,
    consultationFormTemplates: [] as Array<{
      veterinarian_id: string;
      name: string;
      is_default: boolean;
    }>,
  };

  let nextMedicationId = 1;

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
            const inserted = { id: `med-${nextMedicationId++}`, ...row };
            state.vetMedication.push(inserted);
            return {
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: inserted, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'vet_prescription_templates') {
        return {
          select: () => ({
            eq: (_c1: string, vetId: string) => ({
              eq: (_c2: string, name: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      state.prescriptionTemplates.find(
                        (r) => r.veterinarian_id === vetId && r.name === name
                      ) ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: {
            veterinarian_id: string;
            name: string;
            items: unknown;
          }) => {
            state.prescriptionTemplates.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'vet_consultation_form_templates') {
        return {
          select: () => ({
            eq: (_c1: string, vetId: string) => ({
              eq: (_c2: string, name: string) => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      state.consultationFormTemplates.find(
                        (r) => r.veterinarian_id === vetId && r.name === name
                      ) ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: {
            veterinarian_id: string;
            name: string;
            is_default: boolean;
          }) => {
            state.consultationFormTemplates.push(row);
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

  describe('seedVetMedicationCatalog / seedPrescriptionTemplates / seedConsultationFormTemplates', () => {
    it('creates every planned catalog item for the given veterinarian', async () => {
      const medicationIdByName = await seedVetMedicationCatalog(
        supabase as never,
        VET_ID
      );
      await seedPrescriptionTemplates(
        supabase as never,
        VET_ID,
        medicationIdByName
      );
      await seedConsultationFormTemplates(supabase as never, VET_ID);

      expect(supabase.state.vetMedication.length).toBe(
        VET_MEDICATION_SEEDS.length
      );
      expect(supabase.state.prescriptionTemplates.length).toBe(
        PRESCRIPTION_TEMPLATE_SEEDS.length
      );
      expect(supabase.state.consultationFormTemplates.length).toBe(
        CONSULTATION_FORM_TEMPLATE_SEEDS.length
      );
      for (const row of supabase.state.vetMedication) {
        expect(row.veterinarian_id).toBe(VET_ID);
      }
      expect(
        supabase.state.consultationFormTemplates.filter((r) => r.is_default)
      ).toHaveLength(1);
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      const medicationIdByName = await seedVetMedicationCatalog(
        supabase as never,
        VET_ID
      );
      await seedVetMedicationCatalog(supabase as never, VET_ID);
      await seedPrescriptionTemplates(
        supabase as never,
        VET_ID,
        medicationIdByName
      );
      await seedPrescriptionTemplates(
        supabase as never,
        VET_ID,
        medicationIdByName
      );
      await seedConsultationFormTemplates(supabase as never, VET_ID);
      await seedConsultationFormTemplates(supabase as never, VET_ID);

      expect(supabase.state.vetMedication.length).toBe(
        VET_MEDICATION_SEEDS.length
      );
      expect(supabase.state.prescriptionTemplates.length).toBe(
        PRESCRIPTION_TEMPLATE_SEEDS.length
      );
      expect(supabase.state.consultationFormTemplates.length).toBe(
        CONSULTATION_FORM_TEMPLATE_SEEDS.length
      );
    });
  });
});
