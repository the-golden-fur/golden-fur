import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { VetMedicationCatalogItem } from '../veterinary.types.ts';
import type {
  CreateMedicationCatalogItemInput,
  UpdateMedicationCatalogItemInput,
} from '../modules/validators/veterinary.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * The medication catalog is one clinic-wide list (pharmacy prescriptions:
 * its default_price is the selling price, so it can't differ per vet) - any
 * Veterinarian may read, add to, edit or remove any item, and
 * veterinarian_id only records who added it. The routes' vetWrite role check
 * is the access gate; nothing here filters by requester.
 */
export async function listMedicationCatalog(): Promise<
  VetMedicationCatalogItem[]
> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .select('*')
    .order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

export async function createMedicationCatalogItem(
  veterinarianId: string,
  input: CreateMedicationCatalogItemInput
): Promise<VetMedicationCatalogItem> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .insert({
      veterinarian_id: veterinarianId,
      name: input.name,
      default_price: input.default_price ?? null,
      default_medicine_type: input.default_medicine_type ?? null,
      icon: input.icon ?? null,
      image_url: input.image_url ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(400, 'Failed to create medication catalog item');
  return data;
}

export async function updateMedicationCatalogItem(
  itemId: string,
  updates: UpdateMedicationCatalogItemInput
): Promise<VetMedicationCatalogItem> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Medication catalog item not found');
  return data;
}

export async function deleteMedicationCatalogItem(
  itemId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .delete()
    .eq('id', itemId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Medication catalog item not found');
}

// #117: listProcedureCatalog/createProcedureCatalogItem/
// updateProcedureCatalogItem/deleteProcedureCatalogItem removed alongside
// the rest of the personal procedure catalog (vet_procedure_catalog is
// dropped in 20260929230_custom_drop_vet_procedure_catalog.sql). See
// consultationFormTemplate.service.ts for the new per-vet catalog that
// replaces it.
