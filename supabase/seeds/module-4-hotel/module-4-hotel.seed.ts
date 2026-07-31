// M05 Pet Hotel - Sprint 4 Epic A branch-dependent seed data (Issue #71
// AC-4), plus the #79-revision food_catalog/medication_catalog reference
// lists (not branch-scoped, unlike cages) so CatalogComboBox has real
// options out of the box instead of an empty dropdown.
//
// Seeds public.cages: a handful of cages per size category, per branch,
// matching the plan in module-4-hotel.seed.sql.
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at module-4-hotel.seed.sql. Unlike the .sql file,
// this script is idempotent (safe to re-run against a database that
// already has these rows) via per-row existence checks rather than
// ON CONFLICT, matching module-3-maintenance.seed.ts's own convention.
//
// Folder numbering note: named module-4 (the 4th seed batch added), not
// module-5 - module-1/2/3's own numbers already track creation order, not
// the Modules-Features module number (module-3-maintenance covers M13/M12,
// not M03), so this one stays consistent with that sequence even though
// the underlying feature is M05.
//
// Run manually - not wired into `npm run dev`:
//
//   npm run seed:module-4
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
// server/.env), and requires migration 20260727050 (cages table) plus
// module-1's seed (branches) to have already run.

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

type CageSize = 'S' | 'M' | 'L' | 'XL';

const CAGE_PLAN: Array<{ size: CageSize; seq: number }> = [
  { size: 'S', seq: 1 },
  { size: 'S', seq: 2 },
  { size: 'M', seq: 1 },
  { size: 'M', seq: 2 },
  { size: 'L', seq: 1 },
  { size: 'L', seq: 2 },
  { size: 'XL', seq: 1 },
];

const FOOD_CATALOG_PLAN: Array<{ name: string; price: number }> = [
  { name: 'Dry Kibble - Chicken', price: 50 },
  { name: 'Dry Kibble - Beef', price: 50 },
  { name: 'Wet Food - Canned', price: 75 },
  { name: 'Puppy Formula', price: 60 },
  { name: 'Senior Formula', price: 65 },
  { name: 'Grain-Free Kibble', price: 90 },
  { name: 'Prescription Diet', price: 120 },
];

const MEDICATION_CATALOG_PLAN: Array<{ name: string; price: number }> = [
  { name: 'Amoxicillin 250mg', price: 120 },
  { name: 'Rimadyl 75mg', price: 200 },
  { name: 'Flea & Tick Treatment', price: 150 },
  { name: 'Ear Drops', price: 80 },
  { name: 'Probiotic Supplement', price: 100 },
  { name: 'Antihistamine (Diphenhydramine)', price: 60 },
];

/** Sprint 5 unification (#82): both plans insert into the shared
 * public.product_catalog table now (migration 20260731067), tagged with
 * category + service_scope instead of living in their own tables. */
const HOTEL_SERVICE_SCOPE = 'hotel';

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

/** 7 cages per branch (2xS, 2xM, 2xL, 1xXL), labeled `<Branch>-<Size>-<seq>`,
 * e.g. 'Makati-S-01' - matching module-4-hotel.seed.sql's plan exactly. */
export async function seedCages(supabase: ReturnType<typeof createClient>) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  let created = 0;

  for (const branch of branches) {
    for (const cage of CAGE_PLAN) {
      const cageLabel = `${branch.name}-${cage.size}-${String(cage.seq).padStart(2, '0')}`;

      const { data: existing } = await supabase
        .from('cages')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('cage_label', cageLabel)
        .maybeSingle();

      if (existing) continue;

      const { error } = await supabase.from('cages').insert({
        branch_id: branch.id,
        cage_label: cageLabel,
        size: cage.size,
        status: 'Available',
      });

      if (error) {
        console.error(
          `cage insert failed (${cageLabel} at ${branch.name}): ${error.message}`
        );
        continue;
      }

      created += 1;
    }
  }

  console.log(
    `ensured ${CAGE_PLAN.length} cage(s) exist at ${branches.length} branch(es) (${created} row(s) created)`
  );
}

/** Seeds public.product_catalog with category='food' - global (not
 * branch-scoped, unlike cages), one row per (name, category), guarded by a
 * per-name-and-category existence check. */
export async function seedFoodCatalog(
  supabase: ReturnType<typeof createClient>
) {
  let created = 0;

  for (const item of FOOD_CATALOG_PLAN) {
    const { data: existing } = await supabase
      .from('product_catalog')
      .select('id')
      .eq('name', item.name)
      .eq('category', 'food')
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('product_catalog').insert({
      ...item,
      category: 'food',
      service_scope: HOTEL_SERVICE_SCOPE,
    });

    if (error) {
      console.error(
        `food catalog insert failed (${item.name}): ${error.message}`
      );
      continue;
    }

    created += 1;
  }

  console.log(
    `ensured ${FOOD_CATALOG_PLAN.length} food catalog item(s) exist (${created} row(s) created)`
  );
}

/** Seeds public.product_catalog with category='medication' - same shape/
 * convention as seedFoodCatalog above. */
export async function seedMedicationCatalog(
  supabase: ReturnType<typeof createClient>
) {
  let created = 0;

  for (const item of MEDICATION_CATALOG_PLAN) {
    const { data: existing } = await supabase
      .from('product_catalog')
      .select('id')
      .eq('name', item.name)
      .eq('category', 'medication')
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('product_catalog').insert({
      ...item,
      category: 'medication',
      service_scope: HOTEL_SERVICE_SCOPE,
    });

    if (error) {
      console.error(
        `medication catalog insert failed (${item.name}): ${error.message}`
      );
      continue;
    }

    created += 1;
  }

  console.log(
    `ensured ${MEDICATION_CATALOG_PLAN.length} medication catalog item(s) exist (${created} row(s) created)`
  );
}

async function main() {
  const supabase = getClient();
  await seedCages(supabase);
  await seedFoodCatalog(supabase);
  await seedMedicationCatalog(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
