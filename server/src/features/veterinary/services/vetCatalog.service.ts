import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  VetMedicationCatalogItem,
  VetProcedureCatalogItem,
} from '../veterinary.types.ts';
import type {
  CreateMedicationCatalogItemInput,
  CreateProcedureCatalogItemInput,
  UpdateMedicationCatalogItemInput,
  UpdateProcedureCatalogItemInput,
} from '../modules/validators/veterinary.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Each vet's medication/procedure catalog is owner-scoped (unlike every
 * other write in this feature, where any Veterinarian may edit any
 * consultation/health-condition row - see 20260825142's dev note). This
 * service uses the Supabase service-role client (bypasses RLS), so every
 * function here re-checks `veterinarian_id = requesterId` itself rather
 * than relying solely on the DB's own RLS policies - mirrors
 * unavailabilityBlock.service.ts's assertCanActOnTarget rationale.
 */
export async function listMedicationCatalog(
  veterinarianId: string
): Promise<VetMedicationCatalogItem[]> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .select('*')
    .eq('veterinarian_id', veterinarianId)
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
      default_dose: input.default_dose ?? null,
      default_price: input.default_price ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(400, 'Failed to create medication catalog item');
  return data;
}

export async function updateMedicationCatalogItem(
  veterinarianId: string,
  itemId: string,
  updates: UpdateMedicationCatalogItemInput
): Promise<VetMedicationCatalogItem> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('veterinarian_id', veterinarianId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Medication catalog item not found');
  return data;
}

export async function deleteMedicationCatalogItem(
  veterinarianId: string,
  itemId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('vet_medication_catalog')
    .delete()
    .eq('id', itemId)
    .eq('veterinarian_id', veterinarianId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Medication catalog item not found');
}

export async function listProcedureCatalog(
  veterinarianId: string
): Promise<VetProcedureCatalogItem[]> {
  const { data, error } = await supabase
    .from('vet_procedure_catalog')
    .select('*')
    .eq('veterinarian_id', veterinarianId)
    .order('description');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

export async function createProcedureCatalogItem(
  veterinarianId: string,
  input: CreateProcedureCatalogItemInput
): Promise<VetProcedureCatalogItem> {
  const { data, error } = await supabase
    .from('vet_procedure_catalog')
    .insert({
      veterinarian_id: veterinarianId,
      procedure_type: input.procedure_type,
      description: input.description,
      default_price: input.default_price ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(400, 'Failed to create procedure catalog item');
  return data;
}

export async function updateProcedureCatalogItem(
  veterinarianId: string,
  itemId: string,
  updates: UpdateProcedureCatalogItemInput
): Promise<VetProcedureCatalogItem> {
  const { data, error } = await supabase
    .from('vet_procedure_catalog')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('veterinarian_id', veterinarianId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Procedure catalog item not found');
  return data;
}

export async function deleteProcedureCatalogItem(
  veterinarianId: string,
  itemId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('vet_procedure_catalog')
    .delete()
    .eq('id', itemId)
    .eq('veterinarian_id', veterinarianId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Procedure catalog item not found');
}
