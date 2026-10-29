#!/usr/bin/env node
/**
 * Delete every auth user (Authentication > Users) in the project given by
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. `supabase db reset --linked`
 * leaves the auth schema alone, so `supabase:reset:remote` runs this to clear
 * the accounts too:
 *
 *   node scripts/seed-linked.mjs auth:wipe-users
 *
 * Deliberately does not read server/.env - the target must be passed in
 * explicitly (seed-linked.mjs does that for the linked project).
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set - run via scripts/seed-linked.mjs.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

let deleted = 0;
let failed = 0;

// Always read page 1: each pass deletes what it lists, so the next batch
// moves up. Stop once a page comes back empty or nothing on it could be
// deleted (avoids looping forever on users that refuse to delete).
for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    console.error(`listUsers failed: ${error.message}`);
    process.exit(1);
  }
  if (data.users.length === 0) break;

  let deletedThisPage = 0;
  for (const user of data.users) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      user.id
    );
    if (deleteError) {
      console.error(`skip: ${user.email ?? user.id}: ${deleteError.message}`);
      failed++;
    } else {
      deletedThisPage++;
    }
  }
  deleted += deletedThisPage;
  if (deletedThisPage === 0) break;
}

console.log(
  `deleted ${deleted} auth user(s)${failed ? `, ${failed} failed` : ''}`
);
process.exitCode = failed ? 1 : 0;
