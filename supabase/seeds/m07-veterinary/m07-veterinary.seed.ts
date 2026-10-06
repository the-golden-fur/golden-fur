// M07 Health & Veterinary Management - reference seed data so the
// consultation form's Prescription/Results pickers have real rows out of
// the box instead of an empty list.
//
// Seeds public.vet_medication_catalog / public.vet_prescription_templates /
// public.vet_consultation_form_templates: a short personal catalog for the
// first seeded Makati Veterinarian (all three tables are owner-scoped -
// each vet only ever sees their own rows).
//
// Custom change ("My Catalog" broken into Medications/Prescriptions/Forms):
// - vet_medication_catalog no longer carries dose/frequency (a medication
//   is just a product definition now) - those moved to
//   vet_prescription_templates, seeded here too.
// - "General Consultation" is seeded as the is_default = true form template
//   - the vitals/diagnosis fields that used to be fixed columns on
//   consultations are now just this ordinary template, auto-offered the
//   first time a fresh consultation is opened (ConsultationDetailPanel.tsx).
//
// #117: the personal procedure catalog (vet_procedure_catalog) this file
// used to also seed is dropped (20260929230_custom_drop_vet_procedure_catalog.sql).
//
// The two M13 promos that used to live in this file moved to
// ../m13-maintenance/ when the seed folders were renamed to match the
// Modules-Features module numbers (M01-M14).
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at m07-veterinary.seed.sql. Unlike the .sql file, this
// script is idempotent (safe to re-run against a database that already has
// these rows) via per-row existence checks rather than ON CONFLICT.
//
// Run via `npm run seed:all` (which invokes every m*/*.seed.ts in order) -
// not wired into `npm run dev`. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from server/.env), migrations 20260929228
// (consultation form templates), 20260929231 (is_default), 20260929232
// (prescription templates), 20260929233 (medication catalog drops dose/
// frequency), plus m01's seed (branches + staff_profiles).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

export const VET_MEDICATION_SEEDS: Array<{
  name: string;
  defaultPrice: number;
  defaultMedicineType: string;
}> = [
  { name: 'Amoxicillin 250mg', defaultPrice: 120, defaultMedicineType: 'Oral' },
  {
    name: 'Meloxicam 1.5mg/ml',
    defaultPrice: 180,
    defaultMedicineType: 'Oral',
  },
  { name: 'Apoquel 5.4mg', defaultPrice: 220, defaultMedicineType: 'Oral' },
];

export const PRESCRIPTION_TEMPLATE_SEEDS: Array<{
  name: string;
  items: Array<{
    medicationName: string;
    medicineType: string;
    dose: string;
    frequency: string;
    duration?: string;
  }>;
}> = [
  {
    name: 'Standard Post-Surgery Recovery',
    items: [
      {
        medicationName: 'Amoxicillin 250mg',
        medicineType: 'Oral',
        dose: '1 tablet',
        frequency: 'Twice daily',
        duration: '7 days',
      },
      {
        medicationName: 'Meloxicam 1.5mg/ml',
        medicineType: 'Oral',
        dose: '0.1 mg/kg',
        frequency: 'Once daily',
        duration: '3 days',
      },
    ],
  },
];

export const CONSULTATION_FORM_TEMPLATE_SEEDS: Array<{
  name: string;
  isDefault: boolean;
  fields: Array<{
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
    options?: string[];
  }>;
}> = [
  {
    name: 'General Consultation',
    isDefault: true,
    fields: [
      { id: 'temperature', label: 'Temperature', type: 'number' },
      { id: 'weight', label: 'Weight (kg)', type: 'number' },
      { id: 'heart-rate', label: 'Heart Rate', type: 'number' },
      { id: 'respiratory-rate', label: 'Respiratory Rate', type: 'number' },
      { id: 'diagnosis', label: 'Diagnosis', type: 'textarea' },
    ],
  },
  {
    name: 'Dental Check',
    isDefault: false,
    fields: [
      {
        id: 'tartar-level',
        label: 'Tartar level',
        type: 'select',
        options: ['None', 'Mild', 'Moderate', 'Severe'],
      },
      { id: 'gum-condition', label: 'Gum condition', type: 'text' },
    ],
  },
  {
    name: 'Wellness Exam Notes',
    isDefault: false,
    fields: [
      { id: 'general-condition', label: 'General condition', type: 'textarea' },
      {
        id: 'activity-level',
        label: 'Activity level',
        type: 'select',
        options: ['Low', 'Normal', 'High'],
      },
    ],
  },
];

function getClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see server/.env).'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

/** The Veterinarian whose personal catalog the seeded rows belong to - the
 * first seeded Makati Veterinarian (Makati is the only vet branch). */
async function resolveVeterinarianId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('role', 'Veterinarian')
    .order('registered_email', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.id) {
    console.error(
      'skip: no Veterinarian found in staff_profiles - has m01 seeded first?'
    );
    return null;
  }

  return data.id as string;
}

export async function seedVetMedicationCatalog(
  supabase: ReturnType<typeof createClient>,
  veterinarianId: string
): Promise<Map<string, string>> {
  const idByName = new Map<string, string>();

  for (const item of VET_MEDICATION_SEEDS) {
    const { data: existing } = await supabase
      .from('vet_medication_catalog')
      .select('id')
      .eq('veterinarian_id', veterinarianId)
      .eq('name', item.name)
      .maybeSingle();

    if (existing) {
      idByName.set(item.name, existing.id as string);
      continue;
    }

    const { data, error } = await supabase
      .from('vet_medication_catalog')
      .insert({
        veterinarian_id: veterinarianId,
        name: item.name,
        default_price: item.defaultPrice,
        default_medicine_type: item.defaultMedicineType,
      })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error(
        `vet medication insert failed (${item.name}): ${error?.message}`
      );
      continue;
    }

    idByName.set(item.name, data.id as string);
  }

  console.log(
    `ensured ${VET_MEDICATION_SEEDS.length} vet medication catalog item(s) exist`
  );
  return idByName;
}

export async function seedPrescriptionTemplates(
  supabase: ReturnType<typeof createClient>,
  veterinarianId: string,
  medicationIdByName: Map<string, string>
) {
  let created = 0;

  for (const template of PRESCRIPTION_TEMPLATE_SEEDS) {
    const { data: existing } = await supabase
      .from('vet_prescription_templates')
      .select('id')
      .eq('veterinarian_id', veterinarianId)
      .eq('name', template.name)
      .maybeSingle();

    if (existing) continue;

    const items = template.items.map((item) => ({
      medication_catalog_id:
        medicationIdByName.get(item.medicationName) ?? null,
      name: item.medicationName,
      medicine_type: item.medicineType,
      dose: item.dose,
      frequency: item.frequency,
      duration: item.duration,
    }));

    const { error } = await supabase.from('vet_prescription_templates').insert({
      veterinarian_id: veterinarianId,
      name: template.name,
      items,
    });

    if (error) {
      console.error(
        `prescription template insert failed (${template.name}): ${error.message}`
      );
      continue;
    }

    created += 1;
  }

  console.log(
    `ensured ${PRESCRIPTION_TEMPLATE_SEEDS.length} prescription template(s) exist (${created} row(s) created)`
  );
}

export async function seedConsultationFormTemplates(
  supabase: ReturnType<typeof createClient>,
  veterinarianId: string
) {
  let created = 0;

  for (const item of CONSULTATION_FORM_TEMPLATE_SEEDS) {
    const { data: existing } = await supabase
      .from('vet_consultation_form_templates')
      .select('id')
      .eq('veterinarian_id', veterinarianId)
      .eq('name', item.name)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase
      .from('vet_consultation_form_templates')
      .insert({
        veterinarian_id: veterinarianId,
        name: item.name,
        fields: item.fields,
        is_default: item.isDefault,
      });

    if (error) {
      console.error(
        `consultation form template insert failed (${item.name}): ${error.message}`
      );
      continue;
    }

    created += 1;
  }

  console.log(
    `ensured ${CONSULTATION_FORM_TEMPLATE_SEEDS.length} consultation form template(s) exist (${created} row(s) created)`
  );
}

async function main() {
  const supabase = getClient();

  const veterinarianId = await resolveVeterinarianId(supabase);
  if (veterinarianId) {
    const medicationIdByName = await seedVetMedicationCatalog(
      supabase,
      veterinarianId
    );
    await seedPrescriptionTemplates(
      supabase,
      veterinarianId,
      medicationIdByName
    );
    await seedConsultationFormTemplates(supabase, veterinarianId);
  }
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
