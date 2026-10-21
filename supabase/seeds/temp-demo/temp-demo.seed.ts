import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { seedTempTransactions } from './temp-demo.transactions.ts';
import { seedTempClinical } from './temp-demo.clinical.ts';

config({ path: 'server/.env' });

const GROUP_1 = '6d000000-0000-4000-8000-000000000001';
const GROUP_2 = '6d000000-0000-4000-8000-000000000002';

const THREAD_ANNOUNCEMENT = '6d000000-0000-4000-8000-000000000101';
const THREAD_MAIL = '6d000000-0000-4000-8000-000000000102';

const MSG_1 = '6d000000-0000-4000-8000-000000000201';
const MSG_2 = '6d000000-0000-4000-8000-000000000202';
const MSG_3 = '6d000000-0000-4000-8000-000000000203';

const DRAFT_1 = '6d000000-0000-4000-8000-000000000301';
const ATTACHMENT_1 = '6d000000-0000-4000-8000-000000000401';

export async function seedTempDemo(supabase: SupabaseClient) {
  const [staffRes, customerRes, branchRes] = await Promise.all([
    supabase.from('staff_profiles').select('id').order('created_at').limit(3),
    supabase
      .from('customer_profiles')
      .select('id')
      .order('created_at')
      .limit(2),
    supabase.from('branches').select('id').order('created_at').limit(1),
  ]);

  for (const res of [staffRes, customerRes, branchRes]) {
    if (res.error) throw res.error;
  }

  const staff = (staffRes.data ?? []).map((row) => row.id as string);
  const customers = (customerRes.data ?? []).map((row) => row.id as string);
  const branchId = branchRes.data?.[0]?.id as string | undefined;

  if (staff.length < 1 || customers.length < 1 || !branchId) {
    throw new Error(
      'Base data missing: need at least 1 staff, 1 customer, and 1 branch (run m01/m02 first)'
    );
  }

  const [staffA, staffB] = [staff[0], staff[1] ?? staff[0]];
  const customerA = customers[0];
  const customerB = customers[1] ?? customers[0];

  const N = 15;
  const uuid = (kind: string, n: number) =>
    `6d000000-0000-4000-8000-${kind}${String(n).padStart(10, '0')}`;
  const pick = <T>(list: T[], n: number): T => list[n % list.length];

  const groups = Array.from({ length: N }, (_, i) => ({
    id: uuid('b1', i + 1),
    customer_id: pick(customers, i),
    branch_id: branchId,
    created_by_staff_id: pick(staff, i),
    discount_amount: 0,
    promo_amount: 0,
    net_total: 900 + i * 50,
    downpayment_required: i % 3 === 0,
    downpayment_amount: i % 3 === 0 ? 450 : null,
    payment_status: i % 3 === 0 ? 'Partially Paid' : 'Pending',
    pay_at_checkout: false,
  }));

  const threads = Array.from({ length: N }, (_, i) =>
    i % 2 === 0
      ? {
          id: uuid('c1', i + 1),
          subject: `Branch notice ${i + 1}`,
          created_by_staff_id: pick(staff, i),
          thread_type: 'announcement',
        }
      : {
          id: uuid('c1', i + 1),
          subject: `Question about my pet ${i + 1}`,
          created_by_customer_id: pick(customers, i),
          thread_type: 'mail',
        }
  );

  const participants = threads.flatMap((t, i) =>
    'created_by_staff_id' in t
      ? [
          {
            id: uuid('c2', i * 2 + 1),
            thread_id: t.id,
            participant_staff_id: pick(staff, i),
          },
        ]
      : [
          {
            id: uuid('c2', i * 2 + 1),
            thread_id: t.id,
            participant_customer_id: pick(customers, i),
          },
          {
            id: uuid('c2', i * 2 + 2),
            thread_id: t.id,
            participant_staff_id: pick(staff, i),
          },
        ]
  );

  const messages = threads.map((t, i) =>
    'created_by_staff_id' in t
      ? {
          id: uuid('c3', i + 1),
          thread_id: t.id,
          sender_staff_id: pick(staff, i),
          body: 'Branch will be closed on the 15th for maintenance.',
        }
      : {
          id: uuid('c3', i + 1),
          thread_id: t.id,
          sender_customer_id: pick(customers, i),
          body: 'Is my pet allowed her usual food during the stay?',
        }
  );

  const drafts = Array.from({ length: N }, (_, i) => ({
    id: uuid('c4', i + 1),
    author_staff_id: pick(staff, i),
    message_type: 'mail',
    subject: `Follow-up ${i + 1}`,
    body: 'Following up on your booking request.',
    recipients: [],
  }));

  const attachments = messages.map((m, i) => ({
    id: uuid('c5', i + 1),
    message_id: m.id,
    file_name: `attachment-${i + 1}.jpg`,
    file_url: `https://example.com/demo/attachment-${i + 1}.jpg`,
    file_size: 2048,
    mime_type: 'image/jpeg',
  }));

  const upserts: Array<[string, Record<string, unknown>[]]> = [
    ['booking_groups', groups],
    ['message_threads', threads],
    ['message_thread_participants', participants],
    ['messages', messages],
    ['message_drafts', drafts],
    ['message_attachments', attachments],
  ];

  for (const [table, rows] of upserts) {
    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  await seedTempTransactions(supabase);
  await seedTempClinical(supabase);
}

export function resolveSeedUrl(
  useLinkedProject: boolean,
  linkedProjectRef?: string,
  configuredUrl = process.env.SUPABASE_URL ?? ''
): string {
  if (!useLinkedProject) return configuredUrl;

  if (!linkedProjectRef || !/^[a-z0-9]+$/.test(linkedProjectRef)) {
    throw new Error(
      'A valid linked Supabase project ref is required. Run `supabase link` first.'
    );
  }

  return `https://${linkedProjectRef}.supabase.co`;
}

function getLinkedServiceRoleKey(projectRef: string): string {
  const result = spawnSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
      windowsHide: true,
    }
  );

  if (result.error) {
    throw new Error(`Unable to run Supabase CLI: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `Unable to retrieve API keys for linked Supabase project ${projectRef}: ${result.stderr.trim()}`
    );
  }

  let keys: unknown;
  try {
    keys = JSON.parse(result.stdout);
  } catch {
    throw new Error('Supabase CLI returned invalid JSON for linked API keys.');
  }

  if (!Array.isArray(keys)) {
    throw new Error(
      'Supabase CLI returned an unexpected linked API keys format.'
    );
  }

  const serviceRoleKey = keys.find(
    (key): key is { name: string; api_key: string } =>
      typeof key === 'object' &&
      key !== null &&
      'name' in key &&
      key.name === 'service_role' &&
      'api_key' in key &&
      typeof key.api_key === 'string'
  );

  if (!serviceRoleKey) {
    throw new Error(
      `No service_role API key was returned for linked Supabase project ${projectRef}.`
    );
  }

  return serviceRoleKey.api_key;
}

async function main() {
  const useLinkedProject = process.argv.includes('--supabase-linked');
  let linkedProjectRef: string | undefined;

  if (useLinkedProject) {
    const linkedProjectRefPath = path.resolve(
      process.cwd(),
      'supabase/.temp/project-ref'
    );

    try {
      linkedProjectRef = (await readFile(linkedProjectRefPath, 'utf8')).trim();
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new Error(
          'No linked Supabase project found. Run `supabase link` first.'
        );
      }
      throw error;
    }
  }

  const url = resolveSeedUrl(useLinkedProject, linkedProjectRef);
  const serviceKey = useLinkedProject
    ? getLinkedServiceRoleKey(linkedProjectRef ?? '')
    : (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the selected project'
    );
  }

  console.info(`Seeding temp demo data into ${url}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  await seedTempDemo(supabase);
  console.info('Temp demo data seeded.');
}

if (!process.env.VITEST) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
