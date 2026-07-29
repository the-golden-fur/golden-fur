import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSearchAndSort } from './useSearchAndSort';

interface Item {
  name: string;
  value: number;
}

const ITEMS: Item[] = [
  { name: 'Bantay', value: 3 },
  { name: 'Ash', value: 1 },
  { name: 'Milo', value: 2 },
];

function setup(items: Item[] = ITEMS) {
  return renderHook(() =>
    useSearchAndSort<Item, 'name-asc' | 'value-asc'>({
      items,
      matchesQuery: (item, query) => item.name.toLowerCase().includes(query),
      comparators: {
        'name-asc': (a, b) => a.name.localeCompare(b.name),
        'value-asc': (a, b) => a.value - b.value,
      },
      initialSortKey: 'value-asc',
    })
  );
}

describe('useSearchAndSort', () => {
  it('returns every item, sorted by the initial sort key, when search is empty', () => {
    const { result } = setup();

    expect(result.current.result.map((item) => item.name)).toEqual([
      'Ash',
      'Milo',
      'Bantay',
    ]);
  });

  it('filters by the search query (case-insensitive)', () => {
    const { result } = setup();

    act(() => result.current.setSearch('ba'));

    expect(result.current.result.map((item) => item.name)).toEqual(['Bantay']);
  });

  it('re-sorts when the sort key changes', () => {
    const { result } = setup();

    act(() => result.current.setSortKey('name-asc'));

    expect(result.current.result.map((item) => item.name)).toEqual([
      'Ash',
      'Bantay',
      'Milo',
    ]);
  });

  it('returns an empty array when nothing matches the query', () => {
    const { result } = setup();

    act(() => result.current.setSearch('zzz'));

    expect(result.current.result).toEqual([]);
  });
});
