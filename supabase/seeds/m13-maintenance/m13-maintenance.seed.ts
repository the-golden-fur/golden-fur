// M13 Maintenance (Packages, Services & Promos) - branch-dependent reference
// seed data (Issues #44, #40).
//
// Seeds the M13 pieces that need real branches.id values, which only exist
// once m01's seed has run:
//   - public.service_branch_availability: every base service (migration
//     20260715034) available at every branch.
//   - public.packages / package_services / package_branch_availability: the
//     Golden Package, one shared row available at every branch.
//   - public.promos (+ promo_branch_availability): two always-on,
//     all-services promos, available at every branch, so the Promos admin
//     page has real rows out of the box.
//
// Migration 20260715034 seeds the branch-independent base service catalog +
// pricing tiers this script assumes already exist.
//
// The M12 Senior Citizen / PWD discount rows used to live here too; they
// moved to ../m12-discounts/ when the seed folders were renamed to match the
// Modules-Features module numbers (M01-M14).
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at m13-maintenance.seed.sql. Unlike the .sql file,
// this script is idempotent (safe to re-run against a database that already
// has these rows) via per-row existence checks rather than ON CONFLICT.
//
// Run via `npm run seed:all` (which invokes every m*/*.seed.ts in order) -
// not wired into `npm run dev`. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from server/.env), migration 20260715034
// (base service catalog), 20260715032 / 20260820141 (promos +
// promo_branch_availability), plus m01's seed (branches).

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

const GOLDEN_PACKAGE_NAME = 'Golden Package';

// Bath (shampoo) + Blow-dry + Brushing - the fixed ids seeded by migration
// 20260715034.
const GOLDEN_PACKAGE_SERVICE_IDS = [
  'a1300000-0000-4000-a000-000000000001',
  'a1300000-0000-4000-a000-000000000002',
  'a1300000-0000-4000-a000-000000000003',
];

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

/** Every base service (migration 20260715034) available at every branch. */
export async function seedServiceBranchAvailability(
  supabase: ReturnType<typeof createClient>
) {
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id')
    .like('id', 'a1300000-%');

  if (servicesError || !services?.length) {
    console.error(
      `skip: could not list base services - has migration 20260715034 run? (${servicesError?.message ?? 'no services found'})`
    );
    return;
  }

  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  let created = 0;

  for (const service of services as { id: string }[]) {
    for (const branch of branches) {
      const { data: existing } = await supabase
        .from('service_branch_availability')
        .select('service_id')
        .eq('service_id', service.id)
        .eq('branch_id', branch.id)
        .maybeSingle();

      if (existing) continue;

      const { error } = await supabase
        .from('service_branch_availability')
        .insert({
          service_id: service.id,
          branch_id: branch.id,
          is_available: true,
        });

      if (error) {
        console.error(
          `availability insert failed for service ${service.id} at ${branch.name}: ${error.message}`
        );
        continue;
      }

      created += 1;
    }
  }

  console.log(
    `ensured ${services.length} service(s) are available at ${branches.length} branch(es) (${created} row(s) created)`
  );
}

/** The Golden Package as one shared row, available at every branch, bundling
 * the same three services (custom change: packages moved off the old MA22
 * one-row-per-branch model onto a many-to-many join, mirroring
 * service_branch_availability - see migration
 * 20260818134_custom_package_branch_availability.sql). */
export async function seedGoldenPackage(
  supabase: ReturnType<typeof createClient>
) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  const { data: existingPackage } = await supabase
    .from('packages')
    .select('id')
    .eq('name', GOLDEN_PACKAGE_NAME)
    .maybeSingle();

  let packageId = (existingPackage?.id as string | undefined) ?? undefined;

  if (packageId) {
    console.log('skip: Golden Package already seeded');
  } else {
    const { data: created, error: createError } = await supabase
      .from('packages')
      .insert({
        name: GOLDEN_PACKAGE_NAME,
        use_pricing_matrix: true,
      })
      .select('id')
      .maybeSingle();

    if (createError || !created) {
      console.error(
        `Golden Package insert failed: ${createError?.message ?? 'unknown error'}`
      );
      return;
    }

    packageId = created.id as string;
    console.log('created Golden Package');
  }

  const { data: existingAvailability } = await supabase
    .from('package_branch_availability')
    .select('branch_id')
    .eq('package_id', packageId);

  const availableBranchIds = new Set(
    (existingAvailability ?? []).map((row) => row.branch_id as string)
  );
  const missingBranches = branches.filter(
    (branch) => !availableBranchIds.has(branch.id)
  );

  if (missingBranches.length > 0) {
    const { error: availabilityError } = await supabase
      .from('package_branch_availability')
      .insert(
        missingBranches.map((branch) => ({
          package_id: packageId,
          branch_id: branch.id,
          is_available: true,
        }))
      );

    if (availabilityError) {
      console.error(
        `package_branch_availability insert failed: ${availabilityError.message}`
      );
    }
  }

  const { data: existingLinks } = await supabase
    .from('package_services')
    .select('service_id')
    .eq('package_id', packageId);

  const linkedIds = new Set(
    (existingLinks ?? []).map((link) => link.service_id as string)
  );
  const missingIds = GOLDEN_PACKAGE_SERVICE_IDS.filter(
    (id) => !linkedIds.has(id)
  );

  if (missingIds.length === 0) return;

  const { error: linkError } = await supabase.from('package_services').insert(
    missingIds.map((serviceId) => ({
      package_id: packageId,
      service_id: serviceId,
    }))
  );

  if (linkError) {
    console.error(`package_services insert failed: ${linkError.message}`);
  }
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

async function main() {
  const supabase = getClient();
  await seedServiceBranchAvailability(supabase);
  await seedGoldenPackage(supabase);
  await seedPromos(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
