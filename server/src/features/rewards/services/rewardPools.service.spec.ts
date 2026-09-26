import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveRewardPool,
  createRewardPool,
  hardDeleteRewardPool,
  toRewardPool,
  updateRewardPool,
} from './rewardPools.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];
  builders.length = 0;

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'is',
      'not',
      'order',
      'insert',
      'update',
      'delete',
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    builders.push(builder as Record<string, ReturnType<typeof vi.fn>>);
    return builder as never;
  });
}

function rewardRow(
  id: string,
  weight: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    label: `Reward ${id}`,
    discount_type: 'Percentage',
    value: 10,
    rarity_tier: 'Common',
    weight,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

function poolRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-1',
    name: 'Standard',
    description: null,
    is_active: true,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    reward_pool_rewards: [
      { spin_wheel_rewards: rewardRow('a', 75) },
      { spin_wheel_rewards: rewardRow('b', 25, { rarity_tier: 'Epic' }) },
    ],
    spin_wheel_promo_settings: [],
    ...overrides,
  };
}

describe('rewardPools.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toRewardPool computes member chances, active count, and rarest tier', () => {
    const pool = toRewardPool(
      poolRow({
        reward_pool_rewards: [
          { spin_wheel_rewards: rewardRow('a', 75) },
          { spin_wheel_rewards: rewardRow('b', 25, { rarity_tier: 'Epic' }) },
          {
            spin_wheel_rewards: rewardRow('c', 50, {
              rarity_tier: 'Legendary',
              is_active: false,
            }),
          },
          {
            spin_wheel_rewards: rewardRow('d', 50, {
              archived_at: '2026-09-01T00:00:00.000Z',
            }),
          },
        ],
        spin_wheel_promo_settings: [
          {
            promos: {
              id: 'promo-1',
              name: 'Loyalty Spin',
              is_active: true,
              archived_at: null,
            },
          },
        ],
      }) as never
    );

    expect(
      pool.rewards.map((reward) => [reward.id, reward.chance_percent])
    ).toEqual([
      ['a', 75],
      ['b', 25],
      ['c', 0],
    ]);
    expect(pool.active_reward_count).toBe(2);
    expect(pool.rarest_tier).toBe('Epic');
    expect(pool.promos).toEqual([
      { id: 'promo-1', name: 'Loyalty Spin', is_active: true },
    ]);
  });

  it('createRewardPool inserts the pool then its members', async () => {
    queueFromResults(
      { data: { id: 'pool-1' }, error: null }, // insert pool
      { data: null, error: null }, // delete members
      { data: null, error: null }, // insert members
      { data: poolRow(), error: null } // final fetch
    );

    const pool = await createRewardPool('admin-1', {
      name: 'Standard',
      reward_ids: ['a', 'b', 'a'],
    });

    expect(pool.name).toBe('Standard');
    expect(builders[2].insert.mock.calls[0][0]).toEqual([
      { reward_pool_id: 'pool-1', spin_wheel_reward_id: 'a' },
      { reward_pool_id: 'pool-1', spin_wheel_reward_id: 'b' },
    ]);
  });

  it('createRewardPool maps a duplicate name to 409', async () => {
    queueFromResults({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      createRewardPool('admin-1', { name: 'Standard', reward_ids: [] })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses to deactivate a pool that an active spin wheel promo uses', async () => {
    queueFromResults({
      data: poolRow({
        spin_wheel_promo_settings: [
          {
            promos: {
              id: 'promo-1',
              name: 'Loyalty Spin',
              is_active: true,
              archived_at: null,
            },
          },
        ],
      }),
      error: null,
    });

    await expect(
      updateRewardPool('admin-1', 'pool-1', { is_active: false })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('archive requires the pool to be deactivated first', async () => {
    queueFromResults({ data: poolRow(), error: null });

    await expect(archiveRewardPool('pool-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('hard delete maps a foreign key violation (promo still points at it) to 409', async () => {
    queueFromResults(
      {
        data: poolRow({
          is_active: false,
          archived_at: '2026-09-20T00:00:00.000Z',
        }),
        error: null,
      },
      { data: null, error: { code: '23503', message: 'fk violation' } }
    );

    await expect(hardDeleteRewardPool('pool-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
