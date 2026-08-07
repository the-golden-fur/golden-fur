// M13 Maintenance + M12 Discounts - Sprint 2 Epic A branch-dependent seed
// data (Issue #44).
//
// Seeds public.service_branch_availability, public.packages/
// package_services (the Golden Package), and public.discounts (Senior
// Citizen + PWD) - the three pieces of Issue #44's seed data that need real
// branches.id values, which only exist once module-1's seed has run.
// Migration 20260715034 seeds the branch-independent base service catalog
// + pricing tiers this script assumes already exist.
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at module-3-maintenance.seed.sql. Unlike the .sql
// file, this script is idempotent (safe to re-run against a database that
// already has these rows) via per-row existence checks rather than ON
// CONFLICT, since the SDK's .insert() doesn't expose ON CONFLICT directly.
//
// Run manually - not wired into `npm run dev`:
//
//   npm run seed:module-3
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
// server/.env), and requires migration 20260715034 (base service catalog)
// plus module-1's seed (branches) to have already run.

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
      `skip: could not list branches - has module-1's seed run? (${error?.message ?? 'no branches found'})`
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

/** The Golden Package as one row per branch, bundling the same three services. */
export async function seedGoldenPackage(
  supabase: ReturnType<typeof createClient>
) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  for (const branch of branches) {
    const { data: existingPackage } = await supabase
      .from('packages')
      .select('id')
      .eq('branch_id', branch.id)
      .eq('name', GOLDEN_PACKAGE_NAME)
      .maybeSingle();

    let packageId = (existingPackage?.id as string | undefined) ?? undefined;

    if (packageId) {
      console.log(`skip: Golden Package already seeded at ${branch.name}`);
    } else {
      const { data: created, error: createError } = await supabase
        .from('packages')
        .insert({
          branch_id: branch.id,
          name: GOLDEN_PACKAGE_NAME,
          use_pricing_matrix: true,
        })
        .select('id')
        .maybeSingle();

      if (createError || !created) {
        console.error(
          `Golden Package insert failed at ${branch.name}: ${createError?.message ?? 'unknown error'}`
        );
        continue;
      }

      packageId = created.id as string;
      console.log(`created Golden Package at ${branch.name}`);
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

    if (missingIds.length === 0) continue;

    const { error: linkError } = await supabase.from('package_services').insert(
      missingIds.map((serviceId) => ({
        package_id: packageId,
        service_id: serviceId,
      }))
    );

    if (linkError) {
      console.error(
        `package_services insert failed at ${branch.name}: ${linkError.message}`
      );
    }
  }
}

/**
 * Senior Citizen + PWD, one row per branch per category (16 rows total),
 * inactive by default - see this folder's .md doc for why 16 rows rather
 * than one per branch.
 */
export async function seedMandatedDiscounts(
  supabase: ReturnType<typeof createClient>
) {
  const branches = await getBranches(supabase);
  if (branches.length === 0) return;

  let created = 0;

  for (const branch of branches) {
    for (const name of MANDATED_DISCOUNTS) {
      for (const category of SERVICE_CATEGORIES) {
        const { data: existing } = await supabase
          .from('discounts')
          .select('id')
          .eq('branch_id', branch.id)
          .eq('name', name)
          .eq('scope_category', category)
          .maybeSingle();

        if (existing) continue;

        const { error } = await supabase.from('discounts').insert({
          branch_id: branch.id,
          name,
          is_mandated: true,
          discount_type: 'Percentage',
          value: 20,
          scope_type: 'category',
          scope_category: category,
          is_active: false,
        });

        if (error) {
          console.error(
            `discount insert failed (${name} / ${category} / ${branch.name}): ${error.message}`
          );
          continue;
        }

        created += 1;
      }
    }
  }

  console.log(
    `ensured mandated discounts exist for ${branches.length} branch(es) x ${MANDATED_DISCOUNTS.length} type(s) x ${SERVICE_CATEGORIES.length} categories (${created} row(s) created)`
  );
}

async function main() {
  const supabase = getClient();
  await seedServiceBranchAvailability(supabase);
  await seedGoldenPackage(supabase);
  await seedMandatedDiscounts(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
