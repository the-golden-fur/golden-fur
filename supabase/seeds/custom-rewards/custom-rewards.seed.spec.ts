import { describe, expect, it } from 'vitest';
import {
  MONTHLY_LOGIN_PROMO_NAME,
  RARE_POOL_NAME,
  REWARD_POOL_SEEDS,
  seedMonthlyLoginSpinPromo,
  seedRewardPools,
  seedSpinWheelRewards,
  seedWeeklyRecurringPromo,
  SPIN_WHEEL_REWARD_SEEDS,
  STANDARD_POOL_NAME,
} from './custom-rewards.seed.ts';

type Row = Record<string, unknown>;

/**
 * Tiny in-memory stand-in for the supabase-js query builder - just enough
 * of select/eq/is/maybeSingle/insert for this seed's own calls. Every table
 * is a plain array; eq/is filters apply to whatever select() returns.
 */
function createMockSupabase(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    spin_wheel_rewards: [],
    reward_pools: [],
    reward_pool_rewards: [],
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    promos: [],
    promo_branch_availability: [],
    spin_wheel_promo_settings: [],
    ...initial,
  };
  let seq = 0;

  function query(table: string) {
    const filters: Array<(row: Row) => boolean> = [];

    const run = () => ({
      data: tables[table].filter((row) => filters.every((f) => f(row))),
      error: null,
    });

    const chain = {
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      maybeSingle: () =>
        Promise.resolve({ data: run().data[0] ?? null, error: null }),
      then: (resolve: (result: ReturnType<typeof run>) => void) =>
        resolve(run()),
    };

    return chain;
  }

  const supabase = {
    from: (table: string) => {
      if (!(table in tables)) {
        throw new Error(`Unexpected table in mock: ${table}`);
      }

      return {
        select: () => query(table),
        insert: (input: Row | Row[]) => {
          const rows = (Array.isArray(input) ? input : [input]).map((row) => ({
            id: `${table}-${++seq}`,
            archived_at: null,
            ...row,
          }));
          tables[table].push(...rows);

          const result = { data: null, error: null };
          return {
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: rows[0].id }, error: null }),
            }),
            then: (resolve: (value: typeof result) => void) => resolve(result),
          };
        },
      };
    },
  };

  return { supabase, tables };
}

describe('custom-rewards.seed (session 114)', () => {
  describe('seedSpinWheelRewards', () => {
    it('inserts every reward with a tier and weight - no 100% total required', async () => {
      const { supabase, tables } = createMockSupabase();

      await seedSpinWheelRewards(supabase as never);

      expect(tables.spin_wheel_rewards).toHaveLength(
        SPIN_WHEEL_REWARD_SEEDS.length
      );
      for (const row of tables.spin_wheel_rewards) {
        expect(row.rarity_tier).toBeTypeOf('string');
        expect(row.weight).toBeGreaterThan(0);
        expect(row).not.toHaveProperty('rarity_percent');
      }
    });

    it('only inserts labels that are missing (per-row, not all-or-nothing)', async () => {
      const { supabase, tables } = createMockSupabase({
        spin_wheel_rewards: [
          { id: 'admin-1', label: '5% off your next booking' },
          { id: 'admin-2', label: 'Some admin-added reward' },
        ],
      });

      await seedSpinWheelRewards(supabase as never);

      expect(tables.spin_wheel_rewards).toHaveLength(
        2 + SPIN_WHEEL_REWARD_SEEDS.length - 1
      );
    });
  });

  describe('seedRewardPools', () => {
    it('creates both pools and attaches their rewards by label, idempotently', async () => {
      const { supabase, tables } = createMockSupabase();

      await seedSpinWheelRewards(supabase as never);
      await seedRewardPools(supabase as never);
      await seedRewardPools(supabase as never);

      expect(tables.reward_pools.map((pool) => pool.name)).toEqual([
        STANDARD_POOL_NAME,
        RARE_POOL_NAME,
      ]);
      const expectedMembers = REWARD_POOL_SEEDS.reduce(
        (sum, pool) => sum + pool.rewardLabels.length,
        0
      );
      expect(tables.reward_pool_rewards).toHaveLength(expectedMembers);
    });

    it('fills the Standard pool that migration 20260925213 created empty', async () => {
      const { supabase, tables } = createMockSupabase({
        reward_pools: [{ id: 'pool-standard', name: STANDARD_POOL_NAME }],
      });

      await seedSpinWheelRewards(supabase as never);
      await seedRewardPools(supabase as never);

      expect(
        tables.reward_pools.filter((pool) => pool.name === STANDARD_POOL_NAME)
      ).toHaveLength(1);
      expect(
        tables.reward_pool_rewards.filter(
          (row) => row.reward_pool_id === 'pool-standard'
        )
      ).toHaveLength(5);
    });
  });

  describe('seedWeeklyRecurringPromo', () => {
    it('creates the demo promo and makes it available at every branch, once', async () => {
      const { supabase, tables } = createMockSupabase();

      await seedWeeklyRecurringPromo(supabase as never);
      await seedWeeklyRecurringPromo(supabase as never);

      expect(tables.promos).toHaveLength(1);
      expect(tables.promo_branch_availability).toHaveLength(2);
    });
  });

  describe('seedMonthlyLoginSpinPromo', () => {
    it('creates a spin_wheel promo on the Rare Rewards pool with a monthly streak, once', async () => {
      const { supabase, tables } = createMockSupabase();

      await seedSpinWheelRewards(supabase as never);
      await seedRewardPools(supabase as never);
      await seedMonthlyLoginSpinPromo(supabase as never);
      await seedMonthlyLoginSpinPromo(supabase as never);

      const promos = tables.promos.filter(
        (promo) => promo.name === MONTHLY_LOGIN_PROMO_NAME
      );
      expect(promos).toHaveLength(1);
      expect(promos[0]).toMatchObject({ promo_type: 'spin_wheel' });
      expect(promos[0]).not.toHaveProperty('discount_type');

      const rarePool = tables.reward_pools.find(
        (pool) => pool.name === RARE_POOL_NAME
      );
      expect(tables.spin_wheel_promo_settings).toEqual([
        expect.objectContaining({
          promo_id: promos[0].id,
          reward_pool_id: rarePool?.id,
          login_trigger: 'monthly_login_streak',
          login_streak_days: 5,
          pity_threshold: 3,
        }),
      ]);
      expect(tables.promo_branch_availability).toHaveLength(0);
    });

    it('skips when the Rare Rewards pool does not exist', async () => {
      const { supabase, tables } = createMockSupabase();

      await seedMonthlyLoginSpinPromo(supabase as never);

      expect(tables.promos).toHaveLength(0);
    });
  });
});
