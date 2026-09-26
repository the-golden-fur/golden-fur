import { describe, expect, it } from 'vitest';
import {
  deriveDateRange,
  deriveStatusFilter,
} from './consultationQueueFilterFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';

describe('deriveDateRange', () => {
  it('resolves a preset date-range tile to from/to', () => {
    const tiles: FilterTile[] = [
      { fieldId: 'date', value: { preset: 'today', from: null, to: null } },
    ];

    const range = deriveDateRange(tiles);
    expect(range.from).toBe(range.to); // "today" is a single day
    expect(range.from).not.toBeNull();
  });

  it('resolves a custom date-range tile straight from its from/to', () => {
    const tiles: FilterTile[] = [
      {
        fieldId: 'date',
        value: { preset: 'custom', from: '2026-09-01', to: '2026-09-05' },
      },
    ];

    expect(deriveDateRange(tiles)).toEqual({
      from: '2026-09-01',
      to: '2026-09-05',
    });
  });

  it('is unbounded once the date tile is removed', () => {
    expect(deriveDateRange([])).toEqual({ from: null, to: null });
  });
});

describe('deriveStatusFilter', () => {
  it("is 'All' when no status tile is present", () => {
    expect(deriveStatusFilter([])).toBe('All');
  });

  it('reads the status tile value', () => {
    const tiles: FilterTile[] = [{ fieldId: 'status', value: 'In Progress' }];
    expect(deriveStatusFilter(tiles)).toBe('In Progress');
  });
});
