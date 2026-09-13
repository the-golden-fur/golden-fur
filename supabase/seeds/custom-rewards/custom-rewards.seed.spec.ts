import { describe, expect, it, vi } from 'vitest';
import {
  seedSpinWheelRewards,
  seedWeeklyRecurringPromo,
  SPIN_WHEEL_REWARD_SEEDS,
} from './custom-rewards.seed.ts';

function createMockSupabase() {
  const state = {
    spinWheelRewards: [] as Array<{ label: string }>,
    insertedRewards: undefined as unknown[] | undefined,
    branches: [
      { id: 'branch-makati', name: 'Makati' },
      { id: 'branch-southwoods', name: 'Southwoods' },
    ],
    promos: new Map<string, { id: string; name: string }>(),
    promoBranchAvailability: [] as Array<{
      promo_id: string;
      branch_id: string;
      is_available: boolean;
    }>,
  };

  let promoSeq = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'spin_wheel_rewards') {
        return {
          select: () =>
            Promise.resolve({ data: state.spinWheelRewards, error: null }),
          insert: (rows: unknown[]) => {
            state.insertedRewards = rows;
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'branches') {
        return {
          select: () => Promise.resolve({ data: state.branches, error: null }),
        };
      }

      if (table === 'promos') {
        return {
          select: () => ({
            eq: (_c: string, name: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: state.promos.get(name) ?? null,
                  error: null,
                }),
            }),
          }),
          insert: (row: { name: string }) => {
            const id = `promo-${++promoSeq}`;
            state.promos.set(row.name, { id, name: row.name });
            return {
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id }, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'promo_branch_availability') {
        return {
          select: () => ({
            eq: (_c: string, promoId: string) =>
              Promise.resolve({
                data: state.promoBranchAvailability.filter(
                  (row) => row.promo_id === promoId
                ),
                error: null,
              }),
          }),
          insert: (rows: typeof state.promoBranchAvailability) => {
            state.promoBranchAvailability.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table in mock: ${table}`);
    }),
  };

  return { supabase, state };
}

describe('custom-rewards.seed', () => {
  describe('seedSpinWheelRewards', () => {
    it('inserts the full starter catalog when the table is empty', async () => {
      const { supabase, state } = createMockSupabase();

      await seedSpinWheelRewards(supabase as never);

      expect(state.insertedRewards).toHaveLength(
        SPIN_WHEEL_REWARD_SEEDS.length
      );
      const rarities = (
        state.insertedRewards as Array<{ rarity_percent: number }>
      )
        .map((row) => row.rarity_percent)
        .reduce((sum, value) => sum + value, 0);
      expect(rarities).toBe(100);
    });

    it('skips entirely when at least one reward already exists (all-or-nothing)', async () => {
      const { supabase, state } = createMockSupabase();
      state.spinWheelRewards = [{ label: 'Some admin-added reward' }];

      await seedSpinWheelRewards(supabase as never);

      expect(state.insertedRewards).toBeUndefined();
    });
  });

  describe('seedWeeklyRecurringPromo', () => {
    it('creates the demo promo and makes it available at every branch', async () => {
      const { supabase, state } = createMockSupabase();

      await seedWeeklyRecurringPromo(supabase as never);

      expect(state.promos.has('Midweek Discount')).toBe(true);
      expect(state.promoBranchAvailability).toHaveLength(2);
    });

    it('is idempotent - skips creating a duplicate promo on a second run', async () => {
      const { supabase, state } = createMockSupabase();

      await seedWeeklyRecurringPromo(supabase as never);
      await seedWeeklyRecurringPromo(supabase as never);

      expect(state.promos.size).toBe(1);
      // Branch availability rows aren't duplicated on the second pass either.
      expect(state.promoBranchAvailability).toHaveLength(2);
    });
  });
});
