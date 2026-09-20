import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sortGroupByAxis, useGroupBy, type GroupByAxis } from './useGroupBy';

interface Cage {
  id: string;
  status: 'Available' | 'Occupied' | 'Under Maintenance';
}

const CAGES: Cage[] = [
  { id: '1', status: 'Available' },
  { id: '2', status: 'Occupied' },
  { id: '3', status: 'Available' },
];

const STATUS_AXIS: GroupByAxis<Cage> = {
  id: 'status',
  label: 'Status',
  columns: ['Available', 'Occupied', 'Under Maintenance'],
  columnFor: (cage) => cage.status,
};

describe('useGroupBy', () => {
  it('returns one bucket in original order per declared column, including empty ones', () => {
    const { result } = renderHook(() => useGroupBy(CAGES, STATUS_AXIS));

    expect(result.current).toEqual([
      { column: 'Available', items: [CAGES[0], CAGES[2]] },
      { column: 'Occupied', items: [CAGES[1]] },
      { column: 'Under Maintenance', items: [] },
    ]);
  });

  it('returns a single "All" bucket when axis is null', () => {
    const { result } = renderHook(() => useGroupBy(CAGES, null));

    expect(result.current).toEqual([{ column: 'All', items: CAGES }]);
  });

  it('keeps items whose column is not in the declared list, in an extra bucket', () => {
    const stray: Cage = { id: '4', status: 'Available' };
    const axisWithGap: GroupByAxis<Cage> = {
      ...STATUS_AXIS,
      columns: ['Occupied'],
    };

    const { result } = renderHook(() =>
      useGroupBy([...CAGES, stray], axisWithGap)
    );

    expect(result.current).toEqual([
      { column: 'Occupied', items: [CAGES[1]] },
      { column: 'Available', items: [CAGES[0], CAGES[2], stray] },
    ]);
  });
});

describe('sortGroupByAxis', () => {
  it("'manual' returns the axis unchanged", () => {
    expect(sortGroupByAxis(STATUS_AXIS, 'manual')).toBe(STATUS_AXIS);
  });

  it("'alphabetical' sorts the columns A-Z without touching columnFor", () => {
    const sorted = sortGroupByAxis(STATUS_AXIS, 'alphabetical');

    expect(sorted.columns).toEqual([
      'Available',
      'Occupied',
      'Under Maintenance',
    ]);
    expect(sorted.columnFor).toBe(STATUS_AXIS.columnFor);
    // Original axis is untouched.
    expect(STATUS_AXIS.columns).toEqual([
      'Available',
      'Occupied',
      'Under Maintenance',
    ]);
  });

  it("'alphabetical' actually reorders when the declared order isn't already sorted", () => {
    const axis: GroupByAxis<{ id: string; status: string }> = {
      id: 'status',
      label: 'Status',
      columns: ['Occupied', 'Available', 'Under Maintenance'],
      columnFor: (item) => item.status,
    };

    expect(sortGroupByAxis(axis, 'alphabetical').columns).toEqual([
      'Available',
      'Occupied',
      'Under Maintenance',
    ]);
  });
});
