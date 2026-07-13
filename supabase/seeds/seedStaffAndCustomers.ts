// Issue #38: seeds one staff account per staff_role (8 total, split across
// both branches) and 3 customer accounts (with 1-2 pets each) via the
// Supabase Admin API, since staff_profiles/customer_profiles have a 1:1 FK
// to auth.users that a plain INSERT can't satisfy on a hosted project.
//
// Run manually: npm --prefix supabase run seed:staff-customers
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env, and
// supabase/seed.sql (branches) already applied.
//
// All seeded accounts use the password: password123

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SEED_PASSWORD = 'password123';

export type StaffRole =
  | 'Superadmin'
  | 'Admin'
  | 'Supervisor'
  | 'Receptionist'
  | 'Groomer'
  | 'Veterinarian'
  | 'Cashier'
  | 'Pet Assistant';

const STAFF_ROLES: StaffRole[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

function roleSlug(role: StaffRole): string {
  return role.toLowerCase().replace(/\s+/g, '');
}

export type BranchRef = { id: string; name: string };

export type StaffSeedRow = {
  email: string;
  username: string;
  displayName: string;
  role: StaffRole;
  branchId: string;
  branchName: string;
};

// Alternates roles across the two branches (by insertion order) so all 8
// roles exist, split evenly, regardless of which branch happens to sort
// first.
export function buildStaffSeedPlan(branches: BranchRef[]): StaffSeedRow[] {
  if (branches.length < 2) {
    throw new Error(
      `buildStaffSeedPlan requires at least 2 branches, got ${branches.length}. Run supabase/seed.sql first.`
    );
  }

  return STAFF_ROLES.map((role, index) => {
    const branch = branches[index % branches.length]!;
    const slug = roleSlug(role);
    const branchSlug = branch.name.toLowerCase();

    return {
      email: `${branchSlug}.${slug}@goldenfur.com`,
      username: `${branchSlug}.${slug}`,
      displayName: `${branch.name} ${role}`,
      role,
      branchId: branch.id,
      branchName: branch.name,
    };
  });
}

export type PetSeed = {
  name: string;
  species: 'Dog' | 'Cat';
  weightClass: 'S' | 'M' | 'L' | 'XL';
  coatType: 'SC' | 'LC';
  breed?: string;
};

export type CustomerSeedRow = {
  email: string;
  fullName: string;
  contactNumber: string;
  facebookId?: string;
  pets: PetSeed[];
};

// One customer (customer9) carries a placeholder facebook_id so the M02
// OAuth account-merge path (an email account later linking a Facebook
// identity to the same profile) can be exercised manually.
//
// Numbered customer7-9 (not customer1-3) to avoid colliding with the
// customer1-6 rows already present from the prior seed.sql design - those
// existing rows have no pets or facebook_id, so this script's own emails
// must be distinct to actually land the pet/facebook_id test data.
export function buildCustomerSeedPlan(): CustomerSeedRow[] {
  return [
    {
      email: 'customer7@goldenfur.com',
      fullName: 'Customer Seven',
      contactNumber: '+63 917 000 0007',
      pets: [
        { name: 'Bantay', species: 'Dog', weightClass: 'S', coatType: 'SC' },
        { name: 'Mimi', species: 'Cat', weightClass: 'L', coatType: 'LC' },
      ],
    },
    {
      email: 'customer8@goldenfur.com',
      fullName: 'Customer Eight',
      contactNumber: '+63 917 000 0008',
      pets: [
        { name: 'Bruno', species: 'Dog', weightClass: 'XL', coatType: 'LC' },
      ],
    },
    {
      email: 'customer9@goldenfur.com',
      fullName: 'Customer Nine',
      contactNumber: '+63 917 000 0009',
      facebookId: 'fb_seed_placeholder_0001',
      pets: [
        { name: 'Luna', species: 'Cat', weightClass: 'M', coatType: 'SC' },
        { name: 'Rocky', species: 'Dog', weightClass: 'L', coatType: 'SC' },
      ],
    },
  ];
}

type SeedSummary = {
  staffCreated: string[];
  staffSkipped: string[];
  customersCreated: string[];
  customersSkipped: string[];
  petsCreated: number;
};

export async function seedStaffAndCustomers(
  supabase: SupabaseClient
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    staffCreated: [],
    staffSkipped: [],
    customersCreated: [],
    customersSkipped: [],
    petsCreated: 0,
  };

  const { data: branches, error: branchesError } = await supabase
    .from('branches')
    .select('id, name');

  if (branchesError) {
    throw new Error(`Failed to load branches: ${branchesError.message}`);
  }
  if (!branches || branches.length < 2) {
    throw new Error(
      'branches table has fewer than 2 rows. Run supabase/seed.sql before this script.'
    );
  }

  for (const staff of buildStaffSeedPlan(branches)) {
    const { data: existing, error: existingError } = await supabase
      .from('staff_profiles')
      .select('id')
      .eq('registered_email', staff.email)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Failed to check for existing staff ${staff.email}: ${existingError.message}`
      );
    }

    if (existing) {
      console.log(`skip: staff ${staff.email} already seeded`); // eslint-disable-line no-console
      summary.staffSkipped.push(staff.email);
      continue;
    }

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: staff.email,
        password: SEED_PASSWORD,
        email_confirm: true,
      });

    if (createError || !created?.user) {
      console.error(
        // eslint-disable-line no-console
        `error: could not create auth user for ${staff.email}: ${createError?.message ?? 'unknown error'}`
      );
      continue;
    }

    const { error: profileError } = await supabase
      .from('staff_profiles')
      .insert({
        id: created.user.id,
        branch_id: staff.branchId,
        role: staff.role,
        username: staff.username,
        registered_email: staff.email,
        display_name: staff.displayName,
        is_active: true,
      });

    if (profileError) {
      console.error(
        // eslint-disable-line no-console
        `error: could not create staff_profiles row for ${staff.email}: ${profileError.message}`
      );
      continue;
    }

    console.log(`created: staff ${staff.email} (${staff.role})`); // eslint-disable-line no-console
    summary.staffCreated.push(staff.email);
  }

  for (const customer of buildCustomerSeedPlan()) {
    const { data: existing, error: existingError } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('account_email', customer.email)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Failed to check for existing customer ${customer.email}: ${existingError.message}`
      );
    }

    if (existing) {
      console.log(`skip: customer ${customer.email} already seeded`); // eslint-disable-line no-console
      summary.customersSkipped.push(customer.email);
      continue;
    }

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: customer.email,
        password: SEED_PASSWORD,
        email_confirm: true,
      });

    if (createError || !created?.user) {
      console.error(
        // eslint-disable-line no-console
        `error: could not create auth user for ${customer.email}: ${createError?.message ?? 'unknown error'}`
      );
      continue;
    }

    const { error: profileError } = await supabase
      .from('customer_profiles')
      .insert({
        id: created.user.id,
        full_name: customer.fullName,
        contact_number: customer.contactNumber,
        account_email: customer.email,
        primary_auth_provider: 'email',
        facebook_id: customer.facebookId ?? null,
      });

    if (profileError) {
      console.error(
        // eslint-disable-line no-console
        `error: could not create customer_profiles row for ${customer.email}: ${profileError.message}`
      );
      continue;
    }

    const { error: petsError } = await supabase.from('pets').insert(
      customer.pets.map((pet) => ({
        customer_id: created.user.id,
        name: pet.name,
        species: pet.species,
        weight_class: pet.weightClass,
        coat_type: pet.coatType,
        breed: pet.breed ?? null,
      }))
    );

    if (petsError) {
      console.error(
        // eslint-disable-line no-console
        `error: could not create pets for ${customer.email}: ${petsError.message}`
      );
      continue;
    }

    console.log(
      // eslint-disable-line no-console
      `created: customer ${customer.email} (${customer.pets.length} pet(s))`
    );
    summary.customersCreated.push(customer.email);
    summary.petsCreated += customer.pets.length;
  }

  return summary;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(scriptDir, '../../server/.env') });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      // eslint-disable-line no-console
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in server/.env before running this script.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const summary = await seedStaffAndCustomers(supabase);

  console.log('\nSummary:'); // eslint-disable-line no-console
  console.log(
    // eslint-disable-line no-console
    `  staff created: ${summary.staffCreated.length}, skipped: ${summary.staffSkipped.length}`
  );
  console.log(
    // eslint-disable-line no-console
    `  customers created: ${summary.customersCreated.length}, skipped: ${summary.customersSkipped.length}`
  );
  console.log(`  pets created: ${summary.petsCreated}`); // eslint-disable-line no-console
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error('Seed script failed:', error); // eslint-disable-line no-console
    process.exit(1);
  });
}
