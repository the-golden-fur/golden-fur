import { describe, expect, it } from 'vitest';
import { overdueFeeSoFar } from './overdueFeeSoFar';

const MINUTE = 60 * 1000;

describe('overdueFeeSoFar', () => {
  it('is nothing within the grace period', () => {
    expect(overdueFeeSoFar(0, 50, 15)).toBe(0);
    expect(overdueFeeSoFar(15 * MINUTE, 50, 15)).toBe(0);
  });

  it('charges the flat fee for every started hour once past the grace period', () => {
    expect(overdueFeeSoFar(16 * MINUTE, 50, 15)).toBe(50);
    expect(overdueFeeSoFar(60 * MINUTE, 50, 15)).toBe(50);
    expect(overdueFeeSoFar(61 * MINUTE, 50, 15)).toBe(100);
  });

  it('treats a missing grace period as none', () => {
    expect(overdueFeeSoFar(1 * MINUTE, 50, null)).toBe(50);
  });
});
