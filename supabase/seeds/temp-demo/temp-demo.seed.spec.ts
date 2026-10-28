import { describe, expect, it, vi } from 'vitest';
import { seedTempDemo } from './temp-demo.seed.ts';
import { seedTempRoleDemo } from './temp-demo.roles.ts';
import { seedTempHistory } from './temp-demo.history.ts';
import { seedTempProgress } from './temp-demo.progress.ts';

const LOOKUPS: Record<string, Array<Record<string, unknown>>> = {
  staff_profiles: [
    { id: 'staff-1', branch_id: 'branch-1', role: 'Groomer' },
    { id: 'staff-2', branch_id: 'branch-1', role: 'Front Desk' },
    { id: 'staff-3', branch_id: 'branch-1', role: 'Supervisor' },
  ],
  customer_profiles: [{ id: 'cust-1' }, { id: 'cust-2' }],
  branches: [
    { id: 'branch-1', is_vet_branch: true },
    { id: 'branch-2', is_vet_branch: false },
  ],
  pets: [
    { id: 'pet-1', customer_id: 'cust-1' },
    { id: 'pet-2', customer_id: 'cust-2' },
  ],
  cages: [
    { id: 'cage-1', branch_id: 'branch-1', size: 'S', status: 'Available' },
    { id: 'cage-2', branch_id: 'branch-2', size: 'S', status: 'Available' },
    { id: 'cage-3', branch_id: 'branch-1', size: 'M', status: 'Available' },
    { id: 'cage-4', branch_id: 'branch-1', size: 'L', status: 'Available' },
  ],
  services: [
    {
      id: 'svc-groom',
      category: 'Grooming',
      base_price: 300,
      duration_minutes: 60,
      is_active: true,
    },
    {
      id: 'svc-hotel',
      category: 'Hotel',
      base_price: 800,
      duration_minutes: 1440,
      is_active: true,
    },
    {
      id: 'svc-daycare',
      category: 'Daycare',
      base_price: 200,
      duration_minutes: 480,
      is_active: true,
    },
    {
      id: 'svc-vet',
      category: 'Veterinary',
      base_price: 500,
      duration_minutes: 60,
      is_active: true,
    },
  ],
  promos: [{ id: 'promo-1' }],
  spin_wheel_rewards: [{ id: 'reward-1' }],
  reward_pools: [{ id: 'pool-1' }],
  stays: [
    {
      id: 'stay-1',
      check_in_at: '2026-10-20T01:00:00Z',
      scheduled_check_out_date: '2026-10-23',
      status: 'Completed',
    },
  ],
};

function mockClient() {
  const upsert = vi.fn((_rows: unknown, _options: unknown) =>
    Promise.resolve({ error: null })
  );
  const writes: Array<{ table: string; rows: Array<Record<string, unknown>> }> =
    [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    const rows = LOOKUPS[table] ?? [];
    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      in: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      single: vi.fn(() =>
        Promise.resolve({ data: { id: `${table}-new` }, error: null })
      ),
      then: (resolve: (value: { data: unknown; error: null }) => void) =>
        resolve({ data: rows, error: null }),
      upsert: (data: Array<Record<string, unknown>>, options: unknown) => {
        writes.push({ table, rows: data });
        return upsert(data, options);
      },
      update: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return builder;
      },
    };
    return builder;
  });

  const rowsOf = (table: string) =>
    writes.filter((w) => w.table === table).flatMap((w) => w.rows);

  return { client: { from }, upsert, from, rowsOf, updates };
}

describe('temp-demo seed', () => {
  it('upserts with ignoreDuplicates so re-running never duplicates rows', async () => {
    const { client, upsert } = mockClient();

    await seedTempDemo(client as never);

    expect(upsert).toHaveBeenCalled();
    for (const call of upsert.mock.calls) {
      expect(call[1]).toMatchObject({ ignoreDuplicates: true });
    }
  });

  it('never seeds MFA or device tables', async () => {
    const { client, from } = mockClient();

    await seedTempDemo(client as never);

    const tables = from.mock.calls.map((call) => call[0] as string);
    expect(tables.some((t) => t.startsWith('mfa_'))).toBe(false);
    expect(tables).not.toContain('trusted_devices');
  });

  it('fails clearly when base data is missing', async () => {
    const empty = {
      from: vi.fn(() => {
        const builder = {
          select: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          is: vi.fn(() => builder),
          in: vi.fn(() => builder),
          in: vi.fn(() => builder),
          then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
            resolve({ data: [], error: null }),
          upsert: vi.fn(),
        };
        return builder;
      }),
    };

    await expect(seedTempDemo(empty as never)).rejects.toThrow(
      /Base data missing/
    );
  });

  it('assigns grooming bookings and sessions to the branch groomer', async () => {
    const { client, rowsOf } = mockClient();

    await seedTempRoleDemo(client as never, new Date('2026-10-25T03:00:00Z'));

    const grooming = rowsOf('bookings').filter(
      (b) => b.service_category === 'Grooming' && b.branch_id === 'branch-1'
    );
    expect(grooming.length).toBeGreaterThan(0);
    expect(grooming.every((b) => b.assigned_staff_id === 'staff-1')).toBe(true);
    expect(
      grooming.some(
        (b) =>
          b.status === 'In Progress' &&
          String(b.scheduled_start).startsWith('2026-10-25')
      )
    ).toBe(true);
    expect(
      rowsOf('grooming_sessions').every(
        (s) => s.assigned_groomer_id === 'staff-1'
      )
    ).toBe(true);
  });

  it('gives active stays care instructions, care log rows and occupied cages', async () => {
    const { client, rowsOf, updates } = mockClient();

    await seedTempRoleDemo(client as never, new Date('2026-10-25T03:00:00Z'));

    const active = rowsOf('stays').filter((s) => s.status === 'Active');
    expect(active.length).toBeGreaterThan(0);
    const activeIds = new Set(active.map((s) => s.id));
    for (const table of [
      'care_feeding_instructions',
      'care_walking_instructions',
      'care_playing_instructions',
      'care_log_entries',
    ]) {
      expect(rowsOf(table).some((r) => activeIds.has(r.stay_id))).toBe(true);
    }
    expect(
      rowsOf('care_log_entries').some(
        (r) => r.scheduled_date === '2026-10-25' && r.status === 'Pending'
      )
    ).toBe(true);
    expect(updates).toContainEqual({
      table: 'cages',
      values: { status: 'Occupied' },
    });
  });

  it('seeds the Front Desk queues: credit review, misc sales and days off', async () => {
    const { client, rowsOf } = mockClient();

    await seedTempRoleDemo(client as never, new Date('2026-10-25T03:00:00Z'));

    const logs = rowsOf('cancellation_logs');
    expect(logs.some((l) => l.credit_review_status === 'pending')).toBe(true);
    expect(
      rowsOf('transactions').some(
        (t) => t.transaction_type === 'miscellaneous_sale'
      )
    ).toBe(true);
    const ledger = rowsOf('credit_transactions').map((t) => t.transaction_type);
    expect(ledger).toEqual(expect.arrayContaining(['issuance', 'redemption']));
    const blocks = rowsOf('staff_unavailability_blocks');
    expect(new Set(blocks.map((b) => b.staff_id))).toEqual(
      new Set(['staff-1', 'staff-2'])
    );
  });

  it('never repeats an id within a table', async () => {
    const { client, rowsOf, from } = mockClient();

    await seedTempRoleDemo(client as never, new Date('2026-10-25T03:00:00Z'));

    const tables = new Set(from.mock.calls.map((call) => call[0] as string));
    for (const table of tables) {
      const ids = rowsOf(table).map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('backdates months of paid history, newest month busier than the oldest', async () => {
    const { client, rowsOf } = mockClient();

    await seedTempHistory(client as never, new Date('2026-10-25T03:00:00Z'));

    const txns = rowsOf('transactions');
    expect(txns.length).toBeGreaterThan(0);
    expect(rowsOf('bookings')).toHaveLength(txns.length);
    expect(txns.every((t) => String(t.created_at) < '2026-10-25T02')).toBe(
      true
    );
    const months = (prefix: string) =>
      txns.filter((t) => String(t.created_at).startsWith(prefix)).length;
    expect(months('2026-04')).toBeGreaterThan(0);
    expect(months('2026-09')).toBeGreaterThan(months('2026-04'));
    expect(
      rowsOf('bookings').some(
        (b) => b.service_category === 'Veterinary' && b.branch_id === 'branch-2'
      )
    ).toBe(false);
  });

  it('seeds customer progress, login days and daily care reports', async () => {
    const { client, rowsOf } = mockClient();

    await seedTempProgress(client as never, new Date('2026-10-25T03:00:00Z'));

    expect(rowsOf('customer_booking_milestone_progress')).toHaveLength(2);
    expect(rowsOf('customer_pity_progress')).toHaveLength(2);
    expect(rowsOf('customer_login_days').length).toBeGreaterThan(0);
    expect(rowsOf('care_log_daily_reports').map((r) => r.report_date)).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
  });

  it('never repeats a history id within a table', async () => {
    const { client, rowsOf } = mockClient();

    await seedTempHistory(client as never, new Date('2026-10-25T03:00:00Z'));

    for (const table of ['bookings', 'transactions', 'booking_items']) {
      const ids = rowsOf(table).map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
