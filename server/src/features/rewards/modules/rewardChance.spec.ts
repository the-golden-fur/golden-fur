import { describe, expect, it } from 'vitest';
import { computeChances, rarestTier } from './rewardChance.ts';
import type { RarityTier } from '../rewards.types.ts';

function reward(
  weight: number,
  rarity_tier: RarityTier = 'Common',
  overrides: { is_active?: boolean; archived_at?: string | null } = {}
) {
  return {
    weight,
    rarity_tier,
    is_active: true,
    archived_at: null,
    ...overrides,
  };
}

describe('rewardChance', () => {
  it('computes chance as weight / total active weight, without needing a 100 total', () => {
    const chances = computeChances([reward(50), reward(30), reward(20)]).map(
      (r) => r.chance_percent
    );

    expect(chances).toEqual([50, 30, 20]);
  });

  it('re-normalizes automatically when a reward is added', () => {
    const chances = computeChances([
      reward(50),
      reward(30),
      reward(20),
      reward(50),
    ]).map((r) => r.chance_percent);

    expect(chances).toEqual([33.33, 20, 13.33, 33.33]);
  });

  it('gives inactive and archived rewards 0% and leaves them out of the total', () => {
    const chances = computeChances([
      reward(10),
      reward(10, 'Common', { is_active: false }),
      reward(10, 'Common', { archived_at: '2026-09-01T00:00:00.000Z' }),
    ]).map((r) => r.chance_percent);

    expect(chances).toEqual([100, 0, 0]);
  });

  it('returns all zeros for an empty or fully inactive pool', () => {
    expect(computeChances([])).toEqual([]);
    expect(
      computeChances([reward(5, 'Rare', { is_active: false })])[0]
        .chance_percent
    ).toBe(0);
  });

  it('rarestTier picks the rarest landable tier (what pity guarantees)', () => {
    expect(
      rarestTier([
        reward(50, 'Common'),
        reward(5, 'Epic'),
        reward(1, 'Legendary', { is_active: false }),
      ])
    ).toBe('Epic');
    expect(rarestTier([])).toBeNull();
  });
});
