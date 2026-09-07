// M12 Discount Management - the statutory Senior Citizen / PWD discount rows
// (Issue #44, AC-3).
//
// Seeds public.discounts (+ public.discount_branch_availability): Senior
// Citizen + PWD, one row per service category (2 types x 4 categories = 8
// rows), each made available at every branch. Needs real branches.id values,
// which only exist once m01's seed has run.
//
// Split out of the old module-3-maintenance seed when the seed folders were
// renamed to match the Modules-Features module numbers - discounts are M12,
// service branch availability / packages / promos are M13 (../m13-maintenance/).
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at m12-discounts.seed.sql. Unlike the .sql file, this
// script is idempotent (safe to re-run against a database that already has
// these rows) via per-row existence checks rather than ON CONFLICT.
//
// Run via `npm run seed:all` (which invokes every m*/*.seed.ts in order) -
// not wired into `npm run dev`. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from server/.env), migration 20260715033
// (discounts schema) / 20260820140 (discount_branch_availability), plus
// m01's seed (branches).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

const SERVICE_CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
] as const;

const MANDATED_DISCOUNTS = ['Senior Citizen Discount', 'PWD Discount'] as const;

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
      `skip: could not list branches - has m01's seed run? (${error?.message ?? 'no branches found'})`
    );
    return [];
  }

  return data as { id: string; name: string }[];
}

/**
 * Senior Citizen + PWD, one row per category (8 rows total, custom change:
 * down from the original 16 branch x type x category rows now that
 * discounts moved off a single branch_id column onto the many-to-many
 * discount_branch_availability table - migration 20260820140, mirroring
 * package_branch_availability). Each row is made available at every branch
 * so 'Senior Citizen - Veterinary' still toggles independently per branch
 * (via Branch Availability), just no longer needs a whole separate discount
 * row to do it.
 *
 * Custom change (unify active/available): is_active is no longer an
 * independent switch anywhere in the Discounts model - it always equals
 * "available at >= 1 branch" (discounts.service.ts keeps it in sync on
 * every branch-availability write). Since every row here is seeded
 * available at every branch, it is seeded active too - there is no longer
 * a separate "seeded but a staff member must still switch it on" step for
 * Senior Citizen/PWD; toggling a specific branch off in Branch Availability
 * is what takes it out of service there.
 */
export async function seedMandatedDiscounts(
  supabase: ReturnType<typeof createClient>
) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  let created = 0;

  for (const name of MANDATED_DISCOUNTS) {
    for (const category of SERVICE_CATEGORIES) {
      const { data: existing } = await supabase
        .from('discounts')
        .select('id')
        .eq('name', name)
        .eq('scope_category', category)
        .maybeSingle();

      if (existing) continue;

      const { data: inserted, error } = await supabase
        .from('discounts')
        .insert({
          name,
          is_mandated: true,
          discount_type: 'Percentage',
          value: 20,
          scope_type: 'category',
          scope_category: category,
          is_active: true,
        })
        .select('id')
        .maybeSingle();

      if (error || !inserted) {
        console.error(
          `discount insert failed (${name} / ${category}): ${error?.message}`
        );
        continue;
      }

      const { error: availabilityError } = await supabase
        .from('discount_branch_availability')
        .insert(
          branches.map((branch) => ({
            discount_id: (inserted as { id: string }).id,
            branch_id: branch.id,
            is_available: true,
          }))
        );

      if (availabilityError) {
        console.error(
          `discount branch availability insert failed (${name} / ${category}): ${availabilityError.message}`
        );
        continue;
      }

      created += 1;
    }
  }

  console.log(
    `ensured mandated discounts exist for ${MANDATED_DISCOUNTS.length} type(s) x ${SERVICE_CATEGORIES.length} categories, available at ${branches.length} branch(es) (${created} row(s) created)`
  );
}

async function main() {
  const supabase = getClient();
  await seedMandatedDiscounts(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
