// M13 Promos + M07 Veterinary catalog - reference seed data so the Promos
// admin page and the consultation form's Medication/Procedure comboboxes
// have real rows out of the box instead of an empty list.
//
// Seeds:
//   - public.promos (+ public.promo_branch_availability): two always-on,
//     all-services promos, available at every branch.
//   - public.vet_medication_catalog / public.vet_procedure_catalog: a short
//     personal catalog for the first seeded Makati Veterinarian (these two
//     tables are owner-scoped - each vet only ever sees their own rows).
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at module-5-promos-vet-catalog.seed.sql and runs
// automatically on `supabase db reset` (see supabase/config.toml
// [db.seed] sql_paths). Unlike the .sql file, this script is idempotent
// (safe to re-run against a database that already has these rows) via
// per-row existence checks rather than ON CONFLICT, matching the other
// module-N seed scripts' convention.
//
// Folder numbering note: named module-5 (the 5th seed batch added), not
// module-13/07 - module-1..4's own numbers track creation order, not the
// Modules-Features module number, so this one stays consistent with that
// sequence even though the underlying features are M13/M07.
//
// Run via `npm run seed:all` (this folder has no standalone seed:module-5
// script and no per-module VS Code task - `seed:all` invokes it directly
// with tsx, and the `🌱 Seed: All Modules` task runs seed:all). Not wired
// into `npm run dev`.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
// server/.env), migration 20260715032 (promos), 20260820141
// (promo_branch_availability), 20260825142 (vet catalogs), plus module-1's
// seed (branches + staff_profiles).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

interface PromoSeed {
  name: string;
  discountType: 'Percentage' | 'Flat';
  value: number;
  conditionNote: string;
}

// Both are condition-based (no start/end date) so promoExpiry.job.ts never
// auto-deactivates them - keeps the seeded set stable across resets.
export const PROMO_SEEDS: PromoSeed[] = [
  {
    name: 'Loyalty Reward',
    discountType: 'Percentage',
    value: 10,
    conditionNote: 'Returning customer - 3rd visit onward',
  },
  {
    name: 'Weekday Walk-in',
    discountType: 'Flat',
    value: 100,
    conditionNote: 'Walk-in booking, Monday to Thursday',
  },
];

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

async function getBranches(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.from('branches').select('id, name');

  if (error || !data?.length) {
    console.error(
      `skip: could not list branches - has module-1's seed run? (${error?.message ?? 'no branches found'})`
    );
    return [];
  }

  return data as { id: string; name: string }[];
}

/** Two always-on, all-services promos, each made available at every branch
 * via promo_branch_availability (the many-to-many join that replaced the old
 * promos.branch_scope enum - migration 20260820141). */
export async function seedPromos(supabase: ReturnType<typeof createClient>) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  let created = 0;

  for (const promo of PROMO_SEEDS) {
    const { data: existing } = await supabase
      .from('promos')
      .select('id')
      .eq('name', promo.name)
      .maybeSingle();

    let promoId = existing?.id as string | undefined;

    if (!promoId) {
      const { data: inserted, error } = await supabase
        .from('promos')
        .insert({
          name: promo.name,
          discount_type: promo.discountType,
          value: promo.value,
          scope_type: 'all_services',
          condition_note: promo.conditionNote,
          is_active: true,
        })
        .select('id')
        .maybeSingle();

      if (error || !inserted) {
        console.error(`promo insert failed (${promo.name}): ${error?.message}`);
        continue;
      }

      promoId = inserted.id as string;
      created += 1;
    }

    const { data: existingAvailability } = await supabase
      .from('promo_branch_availability')
      .select('branch_id')
      .eq('promo_id', promoId);

    const availableBranchIds = new Set(
      (existingAvailability ?? []).map((row) => row.branch_id as string)
    );
    const missingBranches = branches.filter(
      (branch) => !availableBranchIds.has(branch.id)
    );

    if (missingBranches.length > 0) {
      const { error: availabilityError } = await supabase
        .from('promo_branch_availability')
        .insert(
          missingBranches.map((branch) => ({
            promo_id: promoId,
            branch_id: branch.id,
            is_available: true,
          }))
        );

      if (availabilityError) {
        console.error(
          `promo_branch_availability insert failed (${promo.name}): ${availabilityError.message}`
        );
      }
    }
  }

  console.log(
    `ensured ${PROMO_SEEDS.length} promo(s) exist, available at ${branches.length} branch(es) (${created} row(s) created)`
  );
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
      'skip: no Veterinarian found in staff_profiles - has module-1 seeded first?'
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
  await seedPromos(supabase);

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
