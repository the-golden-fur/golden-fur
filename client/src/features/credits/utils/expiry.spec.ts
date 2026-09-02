import { describe, expect, it } from 'vitest';
import type { CreditTransaction } from '../credits.types';
import {
  computeExpirySchedule,
  daysUntil,
  describeDaysLeft,
  formatExpiryDate,
  soonestExpiry,
} from './expiry';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function issuance(
  amount: number,
  expires_at: string | null,
  expired_at: string | null = null
): CreditTransaction {
  return {
    id: `txn-${amount}-${expires_at}`,
    credit_balance_id: 'bal-1',
    transaction_type: 'issuance',
    amount,
    cancellation_log_id: null,
    transaction_id: null,
    expires_at,
    expired_at,
    created_at: '2025-12-01T00:00:00Z',
  };
}

describe('computeExpirySchedule', () => {
  it('returns one entry per future expiry date, oldest first', () => {
    const history = [
      issuance(100, '2026-03-01T00:00:00Z'),
      issuance(50, '2026-02-01T00:00:00Z'),
    ];

    const schedule = computeExpirySchedule(history, 150, NOW);

    expect(schedule.map((e) => e.amount)).toEqual([50, 100]);
    expect(formatExpiryDate(schedule[0].expiresAt)).toBe('Feb 1, 2026');
  });

  it('groups lots that fall on the same Manila day even at different times', () => {
    const history = [
      issuance(30, '2026-02-01T02:00:00Z'), // Feb 1 10:00 Manila
      issuance(70, '2026-02-01T20:00:00Z'), // Feb 2 04:00 Manila
    ];

    // The 20:00Z lot is Feb 2 in Manila, so these are two days, not one.
    const schedule = computeExpirySchedule(history, 100, NOW);
    expect(schedule.map((e) => e.amount)).toEqual([30, 70]);
    expect(formatExpiryDate(schedule[0].expiresAt)).toBe('Feb 1, 2026');
    expect(formatExpiryDate(schedule[1].expiresAt)).toBe('Feb 2, 2026');
  });

  it('a single Manila day with two lots is one entry', () => {
    const history = [
      issuance(693, '2026-10-01T05:28:00Z'),
      issuance(693, '2026-10-01T10:30:00Z'),
    ];

    const schedule = computeExpirySchedule(history, 1386, NOW);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(1386);
    expect(formatExpiryDate(schedule[0].expiresAt)).toBe('Oct 1, 2026');
  });

  it('caps the total across all entries at the current balance (FIFO)', () => {
    // ₱120 was spent since issuance - only ₱80 of the ₱200 nominal can still
    // expire, and it goes to the oldest lot first.
    const history = [
      issuance(100, '2026-02-01T00:00:00Z'),
      issuance(100, '2026-03-01T00:00:00Z'),
    ];

    const schedule = computeExpirySchedule(history, 80, NOW);

    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(80);
  });

  it('sums lots that share an expiry date', () => {
    const history = [
      issuance(40, '2026-02-01T00:00:00Z'),
      issuance(60, '2026-02-01T00:00:00Z'),
    ];

    const schedule = computeExpirySchedule(history, 100, NOW);

    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(100);
  });

  it('ignores non-expiring and already-swept lots', () => {
    const history = [
      issuance(100, null),
      issuance(50, '2025-06-01T00:00:00Z', '2025-06-02T00:00:00Z'),
    ];

    expect(computeExpirySchedule(history, 150, NOW)).toEqual([]);
  });

  it('soonestExpiry is schedule[0] (or null)', () => {
    const history = [issuance(50, '2026-02-01T00:00:00Z')];
    expect(soonestExpiry(history, 50, NOW)?.amount).toBe(50);
    expect(soonestExpiry([], 0, NOW)).toBeNull();
  });
});

describe('daysUntil', () => {
  it('counts whole Manila calendar days, independent of time of day', () => {
    const today = Date.parse('2026-09-02T09:00:00Z');
    // Two lots on 2026-10-01, hours apart - both are "29 days".
    expect(daysUntil('2026-10-01T05:28:00Z', today)).toBe(29);
    expect(daysUntil('2026-10-01T15:59:59.999Z', today)).toBe(29);
  });
});

describe('describeDaysLeft', () => {
  it('reads naturally at the boundaries', () => {
    expect(describeDaysLeft(-1)).toBe('Expired');
    expect(describeDaysLeft(0)).toBe('Expires today');
    expect(describeDaysLeft(1)).toBe('1 day left');
    expect(describeDaysLeft(12)).toBe('12 days left');
  });
});
