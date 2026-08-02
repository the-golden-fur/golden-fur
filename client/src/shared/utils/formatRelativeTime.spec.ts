import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './formatRelativeTime';

const NOW = new Date('2026-08-02T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('returns "today" for a timestamp within the last 24 hours', () => {
    expect(
      formatRelativeTime('2026-08-02T01:00:00.000Z', NOW)
    ).toBe('today');
  });

  it('returns "yesterday" for a timestamp 1-2 days back', () => {
    expect(
      formatRelativeTime('2026-08-01T01:00:00.000Z', NOW)
    ).toBe('yesterday');
  });

  it('returns "N days ago" under a month back', () => {
    expect(
      formatRelativeTime('2026-07-28T12:00:00.000Z', NOW)
    ).toBe('5 days ago');
  });

  it('returns "N months ago" under a year back', () => {
    expect(
      formatRelativeTime('2026-05-02T12:00:00.000Z', NOW)
    ).toBe('3 months ago');
  });

  it('returns singular "1 month ago"', () => {
    expect(
      formatRelativeTime('2026-07-01T12:00:00.000Z', NOW)
    ).toBe('1 month ago');
  });

  it('returns "N years ago" past a year back', () => {
    expect(
      formatRelativeTime('2024-01-01T12:00:00.000Z', NOW)
    ).toBe('2 years ago');
  });
});
