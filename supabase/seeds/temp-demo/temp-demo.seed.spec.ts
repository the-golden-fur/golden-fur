import { describe, expect, it, vi } from 'vitest';
import { seedTempDemo } from './temp-demo.seed.ts';

const LOOKUPS: Record<string, Array<Record<string, unknown>>> = {
  staff_profiles: [
    { id: 'staff-1', branch_id: 'branch-1' },
    { id: 'staff-2', branch_id: 'branch-1' },
    { id: 'staff-3', branch_id: 'branch-1' },
  ],
  customer_profiles: [{ id: 'cust-1' }, { id: 'cust-2' }],
  branches: [{ id: 'branch-1' }, { id: 'branch-2' }],
  pets: [
    { id: 'pet-1', customer_id: 'cust-1' },
    { id: 'pet-2', customer_id: 'cust-2' },
  ],
  cages: [
    { id: 'cage-1', branch_id: 'branch-1' },
    { id: 'cage-2', branch_id: 'branch-2' },
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
};

function mockClient() {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn((table: string) => {
    const rows = LOOKUPS[table] ?? [];
    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      in: vi.fn(() => builder),
      then: (resolve: (value: { data: unknown; error: null }) => void) =>
        resolve({ data: rows, error: null }),
      upsert,
    };
    return builder;
  });

  return { client: { from }, upsert, from };
}

describe('temp-demo seed', () => {
  it('upserts with ignoreDuplicates so re-running never duplicates rows', async () => {
    const { client, upsert } = mockClient();

    await seedTempDemo(client as never);

    expect(upsert).toHaveBeenCalled();
    for (const call of upsert.mock.calls) {
      expect(call[1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
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
});
