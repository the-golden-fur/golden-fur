import { describe, expect, it } from 'vitest';
import {
  computeChances,
  formatChance,
  rarestTier,
  tierRank,
} from './rewardChance';
import type { RarityTier } from '../rewards.types';

function reward(
  weight: number,
  rarity_tier: RarityTier = 'Common',
  is_active = true
) {
  return { weight, rarity_tier, is_active, archived_at: null };
}

describe('rewardChance', () => {
  it('turns free weights into chances that always total 100%', () => {
    expect(
      computeChances([reward(1), reward(1), reward(2)]).map(
        (r) => r.chance_percent
      )
    ).toEqual([25, 25, 50]);
  });

  it('excludes inactive rewards from the total', () => {
    expect(
      computeChances([reward(3), reward(3, 'Rare', false)]).map(
        (r) => r.chance_percent
      )
    ).toEqual([100, 0]);
  });

  it('finds the rarest active tier', () => {
    expect(rarestTier([reward(5, 'Rare'), reward(1, 'Epic', false)])).toBe(
      'Rare'
    );
  });

  it('ranks Legendary first', () => {
    expect(tierRank('Legendary')).toBeLessThan(tierRank('Common'));
  });

  it('formats chances without trailing zeros', () => {
    expect(formatChance(25)).toBe('25%');
    expect(formatChance(33.333)).toBe('33.33%');
  });
});
