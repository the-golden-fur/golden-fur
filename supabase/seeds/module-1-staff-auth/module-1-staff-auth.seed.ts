// M01 Staff Auth & Access Control - Sprint 1 reference seed data (Issue #38).
//
// Seeds public.branches and public.staff_profiles. staff_profiles has a 1:1
// foreign key to auth.users, which plain SQL cannot populate (auth.users is
// managed by GoTrue), so this uses the Supabase Admin API
// (supabase.auth.admin.createUser) to create each auth user, then inserts
// the matching staff_profiles row keyed to the returned user id.
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at module-1-staff-auth.seed.sql, for when you'd rather
// run it via the Supabase SQL Editor / psql than a Node script. Unlike the
// .sql file, this script is idempotent (safe to re-run against a database
// that already has these rows) - the .sql file mirrors the original
// dev-convenience seed.sql exactly and is meant to run once against a
// freshly-reset database.
//
// Run manually - not wired into `npm run dev`:
//
//   npm run seed:module-1
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from server/.env).
//
// All accounts use the password: password123
// Staff: <branch>.<role>N@goldenfur.com (e.g. makati.admin2@goldenfur.com)

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

const SEED_PASSWORD = 'password123';
const ACCOUNTS_PER_ROLE_PER_BRANCH = 2;

interface BranchSeed {
  name: string;
  address: string;
  contactNumber: string;
  isVetBranch: boolean;
  operatingHours: Record<string, { open: string; close: string }>;
  timezone: string;
}

export const BRANCH_SEEDS: BranchSeed[] = [
  {
    name: 'Makati',
    address: 'Makati City, Philippines',
    contactNumber: '+63 2 8888 0001',
    isVetBranch: true,
    operatingHours: {
      monday: { open: '08:00', close: '18:00' },
      tuesday: { open: '08:00', close: '18:00' },
      wednesday: { open: '08:00', close: '18:00' },
      thursday: { open: '08:00', close: '18:00' },
      friday: { open: '08:00', close: '18:00' },
      saturday: { open: '09:00', close: '15:00' },
      sunday: { open: '10:00', close: '14:00' },
    },
    timezone: 'Asia/Manila',
  },
  {
    name: 'Southwoods',
    address: 'Southwoods City, Philippines',
    contactNumber: '+63 46 8888 0002',
    isVetBranch: false,
    operatingHours: {
      monday: { open: '08:00', close: '17:00' },
      tuesday: { open: '08:00', close: '17:00' },
      wednesday: { open: '08:00', close: '17:00' },
      thursday: { open: '08:00', close: '17:00' },
      friday: { open: '08:00', close: '17:00' },
      saturday: { open: '09:00', close: '14:00' },
      sunday: { open: '10:00', close: '13:00' },
    },
    timezone: 'Asia/Manila',
  },
];

// 2 accounts per staff_role, per branch (2 branches x 8 roles x 2 = 32 total) - branch.roleN@goldenfur.com
export const ROLE_SEEDS: { role: string; slug: string }[] = [
  { role: 'Superadmin', slug: 'superadmin' },
  { role: 'Admin', slug: 'admin' },
  { role: 'Supervisor', slug: 'supervisor' },
  { role: 'Receptionist', slug: 'receptionist' },
  { role: 'Groomer', slug: 'groomer' },
  { role: 'Veterinarian', slug: 'veterinarian' },
  { role: 'Cashier', slug: 'cashier' },
  { role: 'Pet Assistant', slug: 'petassistant' },
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

export async function seedBranches(supabase: ReturnType<typeof createClient>) {
  for (const branch of BRANCH_SEEDS) {
    const { data: existing } = await supabase
      .from('branches')
      .select('id')
      .eq('name', branch.name)
      .maybeSingle();

    if (existing) {
      console.log(`skip: branch ${branch.name} already seeded`);
      continue;
    }

    const { error } = await supabase.from('branches').insert({
      name: branch.name,
      address: branch.address,
      contact_number: branch.contactNumber,
      is_vet_branch: branch.isVetBranch,
      operating_hours: branch.operatingHours,
      timezone: branch.timezone,
    });

    if (error) {
      console.error(
        `branches insert failed for ${branch.name}: ${error.message}`
      );
      continue;
    }

    console.log(`created branch: ${branch.name}`);
  }
}

export async function seedStaff(supabase: ReturnType<typeof createClient>) {
  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('id, name');

  if (branchError) {
    throw new Error(`Could not load branches: ${branchError.message}`);
  }

  for (const branch of (branches ?? []) as { id: string; name: string }[]) {
    const branchSlug = branch.name.toLowerCase();

    for (const { role, slug } of ROLE_SEEDS) {
      for (let n = 1; n <= ACCOUNTS_PER_ROLE_PER_BRANCH; n += 1) {
        const email = `${branchSlug}.${slug}${n}@goldenfur.com`;
        const username = `${branchSlug}.${slug}${n}`;
        const displayName = `${branch.name} ${role} ${n}`;

        const { data: existing } = await supabase
          .from('staff_profiles')
          .select('id')
          .eq('registered_email', email)
          .maybeSingle();

        if (existing) {
          console.log(`skip: staff ${email} already seeded`);
          continue;
        }

        const { data: userData, error: userError } =
          await supabase.auth.admin.createUser({
            email,
            password: SEED_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: displayName },
          });

        if (userError || !userData?.user) {
          console.error(
            `skip: could not create auth user for ${email}: ${userError?.message ?? 'unknown error'}`
          );
          continue;
        }

        const { error: profileError } = await supabase
          .from('staff_profiles')
          .insert({
            id: userData.user.id,
            branch_id: branch.id,
            role,
            username,
            registered_email: email,
            display_name: displayName,
            is_active: true,
          });

        if (profileError) {
          console.error(
            `skip: staff_profiles insert failed for ${email}: ${profileError.message}`
          );
          continue;
        }

        console.log(`created staff: ${email} (${role} @ ${branch.name})`);
      }
    }
  }
}

async function main() {
  const supabase = getClient();
  await seedBranches(supabase);
  await seedStaff(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
