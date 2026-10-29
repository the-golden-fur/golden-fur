#!/usr/bin/env node
/**
 * Run a seed npm script (default `seed:all`; e.g. `seed:prod`,
 * `seed:sample-data`) against the Supabase project the CLI is linked to
 * (supabase/.temp/project-ref) instead of the one in server/.env:
 *
 *   node scripts/seed-linked.mjs [script]
 *
 * Resolves the linked project's URL + service_role key via the Supabase CLI
 * and exports them as SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY before
 * spawning the script. Every seed calls dotenv without `override`, so these
 * already-set values win over server/.env.
 *
 * Every seed is idempotent (per-row existence checks), so against a project
 * that's already seeded this only adds what's missing - e.g. the Front Desk
 * staff accounts added after the original seed ran.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const isWindows = process.platform === 'win32';

function fail(message) {
  console.error(message);
  process.exit(1);
}

let projectRef;
try {
  projectRef = readFileSync(
    path.resolve(process.cwd(), 'supabase/.temp/project-ref'),
    'utf8'
  ).trim();
} catch {
  fail('No linked Supabase project found. Run `supabase link` first.');
}

if (!/^[a-z0-9]+$/.test(projectRef)) {
  fail(`Invalid linked Supabase project ref: "${projectRef}".`);
}

const keysResult = spawnSync(
  'supabase',
  ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'],
  { encoding: 'utf8', shell: isWindows, windowsHide: true }
);

if (keysResult.error || keysResult.status !== 0) {
  fail(
    `Unable to retrieve API keys for linked Supabase project ${projectRef}: ${
      keysResult.error?.message ?? keysResult.stderr.trim()
    }`
  );
}

let keys;
try {
  keys = JSON.parse(keysResult.stdout);
} catch {
  fail('Supabase CLI returned invalid JSON for linked API keys.');
}

const serviceRoleKey = Array.isArray(keys)
  ? keys.find((key) => key?.name === 'service_role')?.api_key
  : undefined;

if (typeof serviceRoleKey !== 'string' || !serviceRoleKey) {
  fail(`No service_role API key was returned for ${projectRef}.`);
}

const script = process.argv[2] ?? 'seed:all';
if (!/^(seed|auth):[a-z:-]+$/.test(script)) {
  fail(`Not a seed or auth script: "${script}".`);
}

console.log(`Running ${script} against linked Supabase project: ${projectRef}`);

const seedResult = spawnSync('npm', ['run', script], {
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  },
});

process.exit(seedResult.status ?? 1);
