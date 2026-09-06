// M07 Health & Veterinary Management - reference seed data so the
// consultation form's Medication / Procedure comboboxes have real rows out
// of the box instead of an empty list.
//
// Seeds public.vet_medication_catalog / public.vet_procedure_catalog: a
// short personal catalog for the first seeded Makati Veterinarian (these two
// tables are owner-scoped - each vet only ever sees their own rows).
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
// SUPABASE_SERVICE_ROLE_KEY (read from server/.env), migration 20260825142
// (vet catalogs), plus m01's seed (branches + staff_profiles).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

export const VET_MEDICATION_SEEDS: Array<{
  name: string;
  defaultDose: string;
  defaultPrice: number;
}> = [
  {
    name: 'Amoxicillin 250mg',
    defaultDose: '1 tablet BID x 7 days',
    defaultPrice: 120,
  },
  {
    name: 'Meloxicam 1.5mg/ml',
    defaultDose: '0.1 mg/kg SID',
    defaultPrice: 180,
  },
  {
    name: 'Apoquel 5.4mg',
    defaultDose: '1 tablet BID x 14 days',
    defaultPrice: 220,
  },
];

export const VET_PROCEDURE_SEEDS: Array<{
  procedureType:
    | 'Lab test'
    | 'Dental'
    | 'Vaccination'
    | 'Surgery'
    | 'Emergency'
    | 'Wellness Exam';
  description: string;
  defaultPrice: number;
}> = [
  {
    procedureType: 'Wellness Exam',
    description: 'Annual wellness check',
    defaultPrice: 500,
  },
  {
    procedureType: 'Vaccination',
    description: '5-in-1 (DHPPiL) booster',
    defaultPrice: 850,
  },
  {
    procedureType: 'Lab test',
    description: 'Complete blood count (CBC)',
    defaultPrice: 950,
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
) {
  let created = 0;

  for (const item of VET_MEDICATION_SEEDS) {
    const { data: existing } = await supabase
      .from('vet_medication_catalog')
      .select('id')
      .eq('veterinarian_id', veterinarianId)
      .eq('name', item.name)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('vet_medication_catalog').insert({
      veterinarian_id: veterinarianId,
      name: item.name,
      default_dose: item.defaultDose,
      default_price: item.defaultPrice,
    });

    if (error) {
      console.error(
        `vet medication insert failed (${item.name}): ${error.message}`
      );
      continue;
    }

    created += 1;
  }

  console.log(
    `ensured ${VET_MEDICATION_SEEDS.length} vet medication catalog item(s) exist (${created} row(s) created)`
  );
}

export async function seedVetProcedureCatalog(
  supabase: ReturnType<typeof createClient>,
  veterinarianId: string
) {
  let created = 0;

  for (const item of VET_PROCEDURE_SEEDS) {
    const { data: existing } = await supabase
      .from('vet_procedure_catalog')
      .select('id')
      .eq('veterinarian_id', veterinarianId)
      .eq('procedure_type', item.procedureType)
      .eq('description', item.description)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('vet_procedure_catalog').insert({
      veterinarian_id: veterinarianId,
      procedure_type: item.procedureType,
      description: item.description,
      default_price: item.defaultPrice,
    });

    if (error) {
      console.error(
        `vet procedure insert failed (${item.description}): ${error.message}`
      );
      continue;
    }

    created += 1;
  }

  console.log(
    `ensured ${VET_PROCEDURE_SEEDS.length} vet procedure catalog item(s) exist (${created} row(s) created)`
  );
}

async function main() {
  const supabase = getClient();

  const veterinarianId = await resolveVeterinarianId(supabase);
  if (veterinarianId) {
    await seedVetMedicationCatalog(supabase, veterinarianId);
    await seedVetProcedureCatalog(supabase, veterinarianId);
  }
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
