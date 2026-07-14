// M02 Customer Portal & Pet Management - Sprint 1 reference seed data
// (Issue #38).
//
// Seeds public.customer_profiles and public.pets. customer_profiles has a
// 1:1 foreign key to auth.users, which plain SQL cannot populate (auth.users
// is managed by GoTrue), so this uses the Supabase Admin API
// (supabase.auth.admin.createUser) to create each auth user, then inserts
// the matching customer_profiles row keyed to the returned user id, followed
// by that customer's pets rows.
//
// A pure-SQL alternative that produces the same shape of data lives
// alongside this file at module-2-customers-pets.seed.sql, for when you'd
// rather run it via the Supabase SQL Editor / psql than a Node script.
// Unlike the .sql file, this script is idempotent (safe to re-run against a
// database that already has these rows).
//
// Run manually - not wired into `npm run dev`:
//
//   npm run seed:module-2
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from server/.env).
//
// All accounts use the password: password123
// Customer: customerN@goldenfur.com

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(process.cwd(), 'server/.env') });

const SEED_PASSWORD = 'password123';
const CUSTOMER_COUNT = 5;

interface PetSeed {
  name: string;
  species: 'Dog' | 'Cat';
  weightClass: 'S' | 'M' | 'L' | 'XL';
  coatType: 'SC' | 'LC';
}

// 1-2 pets per customer, deliberately varied species/weight_class/coat_type.
export const PETS_BY_CUSTOMER_NUMBER: Record<number, PetSeed[]> = {
  1: [
    { name: 'Max', species: 'Dog', weightClass: 'M', coatType: 'SC' },
    { name: 'Luna', species: 'Cat', weightClass: 'S', coatType: 'LC' },
  ],
  2: [{ name: 'Rex', species: 'Dog', weightClass: 'L', coatType: 'LC' }],
  3: [
    { name: 'Bruno', species: 'Dog', weightClass: 'XL', coatType: 'SC' },
    { name: 'Mimi', species: 'Cat', weightClass: 'M', coatType: 'LC' },
  ],
  4: [{ name: 'Coco', species: 'Cat', weightClass: 'L', coatType: 'SC' }],
  5: [
    { name: 'Bella', species: 'Dog', weightClass: 'S', coatType: 'LC' },
    { name: 'Simba', species: 'Cat', weightClass: 'XL', coatType: 'SC' },
  ],
};

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

export async function seedCustomers(supabase: ReturnType<typeof createClient>) {
  for (let n = 1; n <= CUSTOMER_COUNT; n += 1) {
    const email = `customer${n}@goldenfur.com`;
    const fullName = `Customer ${n}`;
    const contactNumber = `+63 917 000 ${String(n).padStart(4, '0')}`;
    // customer1 carries a stand-in facebook_id so the M02 OAuth
    // account-merge path can be exercised manually without a live Facebook
    // consent flow.
    const facebookId = n === 1 ? 'seed-facebook-id-customer1' : null;

    const { data: existing } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('account_email', email)
      .maybeSingle();

    let customerId = existing?.id as string | undefined;

    if (customerId) {
      console.log(`skip: customer ${email} already seeded`);
    } else {
      const { data: userData, error: userError } =
        await supabase.auth.admin.createUser({
          email,
          password: SEED_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

      if (userError || !userData?.user) {
        console.error(
          `skip: could not create auth user for ${email}: ${userError?.message ?? 'unknown error'}`
        );
        continue;
      }

      const { error: profileError } = await supabase
        .from('customer_profiles')
        .insert({
          id: userData.user.id,
          account_email: email,
          full_name: fullName,
          contact_number: contactNumber,
          facebook_id: facebookId,
        });

      if (profileError) {
        console.error(
          `skip: customer_profiles insert failed for ${email}: ${profileError.message}`
        );
        continue;
      }

      customerId = userData.user.id;
      console.log(`created customer: ${email}`);
    }

    const pets = PETS_BY_CUSTOMER_NUMBER[n] ?? [];

    const { count } = await supabase
      .from('pets')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId as string);

    if (count && count > 0) {
      console.log(`skip: pets for ${email} already seeded`);
      continue;
    }

    const { error: petsError } = await supabase.from('pets').insert(
      pets.map((pet) => ({
        customer_id: customerId,
        name: pet.name,
        species: pet.species,
        weight_class: pet.weightClass,
        coat_type: pet.coatType,
      }))
    );

    if (petsError) {
      console.error(`pets insert failed for ${email}: ${petsError.message}`);
      continue;
    }

    console.log(`created ${pets.length} pet(s) for ${email}`);
  }
}

async function main() {
  const supabase = getClient();
  await seedCustomers(supabase);
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
