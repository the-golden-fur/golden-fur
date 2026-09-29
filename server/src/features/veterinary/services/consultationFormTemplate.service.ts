import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { ConsultationFormTemplate } from '../veterinary.types.ts';
import type {
  CreateConsultationFormTemplateInput,
  UpdateConsultationFormTemplateInput,
} from '../modules/validators/veterinary.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** Custom change: "exactly one default template per vet" is enforced here,
 * not by a DB constraint (see the is_default migration's header note) -
 * clears any other row's is_default before the caller's insert/update sets
 * a new one. A no-op (and cheap) when the caller isn't setting is_default
 * true. */
async function clearOtherDefaults(
  veterinarianId: string,
  excludeTemplateId?: string
) {
  let query = supabase
    .from('vet_consultation_form_templates')
    .update({ is_default: false })
    .eq('veterinarian_id', veterinarianId)
    .eq('is_default', true);

  if (excludeTemplateId) {
    query = query.neq('id', excludeTemplateId);
  }

  const { error } = await query;
  if (error) throwWithStatus(400, error.message);
}

/**
 * #117 consultation form builder: a vet's personal, reusable set of custom
 * fields ("a form builder, where the vet staff can create and choose from in
 * his consultation type services"). Owner-scoped, same shape as
 * vetCatalog.service.ts's medication-catalog functions - this service uses
 * the Supabase service-role client (bypasses RLS), so every function here
 * re-checks `veterinarian_id = requesterId` itself rather than relying
 * solely on the DB's own RLS policies.
 */
export async function listConsultationFormTemplates(
  veterinarianId: string
): Promise<ConsultationFormTemplate[]> {
  const { data, error } = await supabase
    .from('vet_consultation_form_templates')
    .select('*')
    .eq('veterinarian_id', veterinarianId)
    .order('name');

  if (error) throwWithStatus(400, error.message);
  return data ?? [];
}

export async function createConsultationFormTemplate(
  veterinarianId: string,
  input: CreateConsultationFormTemplateInput
): Promise<ConsultationFormTemplate> {
  if (input.is_default) {
    await clearOtherDefaults(veterinarianId);
  }

  const { data, error } = await supabase
    .from('vet_consultation_form_templates')
    .insert({
      veterinarian_id: veterinarianId,
      name: input.name,
      fields: input.fields,
      is_default: input.is_default ?? false,
      icon: input.icon ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) {
    throwWithStatus(400, 'Failed to create consultation form template');
  }
  return data;
}

export async function updateConsultationFormTemplate(
  veterinarianId: string,
  templateId: string,
  updates: UpdateConsultationFormTemplateInput
): Promise<ConsultationFormTemplate> {
  if (updates.is_default) {
    await clearOtherDefaults(veterinarianId, templateId);
  }

  const { data, error } = await supabase
    .from('vet_consultation_form_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('veterinarian_id', veterinarianId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Consultation form template not found');
  return data;
}

export async function deleteConsultationFormTemplate(
  veterinarianId: string,
  templateId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('vet_consultation_form_templates')
    .delete()
    .eq('id', templateId)
    .eq('veterinarian_id', veterinarianId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Consultation form template not found');
}
