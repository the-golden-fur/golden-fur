import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { VetPrescriptionTemplate } from '../veterinary.types.ts';
import type {
  CreatePrescriptionTemplateInput,
  UpdatePrescriptionTemplateInput,
} from '../modules/validators/veterinary.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Custom change ("My Catalog" broken into Medications/Prescriptions/Forms):
 * a vet's personal, reusable prescription templates - "pull multiple
 * medications, assign the dose and frequency on them... when making a new
 * prescription". Owner-scoped, same shape/rationale as
 * consultationFormTemplate.service.ts and vetCatalog.service.ts's
 * medication-catalog functions - this service uses the Supabase
 * service-role client (bypasses RLS), so every function here re-checks
 * `veterinarian_id = requesterId` itself rather than relying solely on the
 * DB's own RLS policies.
 */
export async function listPrescriptionTemplates(
  veterinarianId: string
): Promise<VetPrescriptionTemplate[]> {
  const { data, error } = await supabase
    .from('vet_prescription_templates')
    .select('*')
    .eq('veterinarian_id', veterinarianId)
    .order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

export async function createPrescriptionTemplate(
  veterinarianId: string,
  input: CreatePrescriptionTemplateInput
): Promise<VetPrescriptionTemplate> {
  const { data, error } = await supabase
    .from('vet_prescription_templates')
    .insert({
      veterinarian_id: veterinarianId,
      name: input.name,
      items: input.items,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(400, 'Failed to create prescription template');
  return data;
}

export async function updatePrescriptionTemplate(
  veterinarianId: string,
  templateId: string,
  updates: UpdatePrescriptionTemplateInput
): Promise<VetPrescriptionTemplate> {
  const { data, error } = await supabase
    .from('vet_prescription_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('veterinarian_id', veterinarianId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Prescription template not found');
  return data;
}

export async function deletePrescriptionTemplate(
  veterinarianId: string,
  templateId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('vet_prescription_templates')
    .delete()
    .eq('id', templateId)
    .eq('veterinarian_id', veterinarianId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Prescription template not found');
}
