import { describe, expect, it } from 'vitest';
import { applyPromoCap, type PromoCapRow } from './promoCap.service.ts';

describe('promoCap.service', () => {
  it('returns nothing for an empty candidate list', () => {
    const cap: PromoCapRow = { cap_type: 'percentage', cap_value: 20 };
    expect(applyPromoCap([], cap, 1000)).toEqual([]);
  });

  it('percentage cap trims the last candidate that would cross the cap', () => {
    const cap: PromoCapRow = { cap_type: 'percentage', cap_value: 20 };
    const result = applyPromoCap(
      [
        { key: 'a', amount: 150 },
        { key: 'b', amount: 100 },
      ],
      cap,
      1000 // 20% cap = 200
    );

    expect(result).toEqual([
      { key: 'a', amount: 150 },
      { key: 'b', amount: 50 },
    ]);
  });

  it('flat cap behaves the same way as percentage, just with a fixed ceiling', () => {
    const cap: PromoCapRow = { cap_type: 'flat', cap_value: 120 };
    const result = applyPromoCap(
      [
        { key: 'a', amount: 100 },
        { key: 'b', amount: 100 },
      ],
      cap,
      1000
    );

    expect(result).toEqual([
      { key: 'a', amount: 100 },
      { key: 'b', amount: 20 },
    ]);
  });

  it('count cap keeps the top N candidates at full value and drops the rest', () => {
    const cap: PromoCapRow = { cap_type: 'count', cap_value: 2 };
    const result = applyPromoCap(
      [
        { key: 'a', amount: 50 },
        { key: 'b', amount: 200 },
        { key: 'c', amount: 100 },
      ],
      cap,
      1000
    );

    expect(result).toEqual([
      { key: 'b', amount: 200 },
      { key: 'c', amount: 100 },
    ]);
  });

  it('stops entirely once the cap is exhausted', () => {
    const cap: PromoCapRow = { cap_type: 'flat', cap_value: 50 };
    const result = applyPromoCap(
      [
        { key: 'a', amount: 50 },
        { key: 'b', amount: 30 },
      ],
      cap,
      1000
    );

    expect(result).toEqual([{ key: 'a', amount: 50 }]);
  });
});
