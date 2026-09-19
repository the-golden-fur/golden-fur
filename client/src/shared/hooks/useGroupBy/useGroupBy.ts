import { useMemo } from 'react';

/** One selectable "group by" rule for a `DataBoard`. `columns` is the
 * ordered list of column keys to always show (even empty); `columnFor` maps
 * one item to exactly one of those keys. Generalized from
 * BoardingChecklistKanban's `columnsForGroupBy`/`rowMatchesColumn`. */
export interface GroupByAxis<T> {
  id: string;
  label: string;
  columns: string[];
  columnFor: (item: T) => string;
}

export interface GroupByBucket<T> {
  column: string;
  items: T[];
}

/** Bucket used when no axis is picked (or a page only ever has one board
 * shape, like the fixed-status TransactionBoard). */
const SINGLE_BUCKET_COLUMN = 'All';

/**
 * Splits `items` into ordered buckets per `axis`. `axis: null` returns
 * everything in one "All" bucket - this is how a fixed board (like the old
 * TransactionBoard's hardcoded 3 payment-status columns) gets re-expressed
 * as "no axis chosen" with zero behavior change, and how a page adds
 * optional grouping without a special no-groupBy code path.
 *
 * An item whose `columnFor` result isn't in `axis.columns` still gets its
 * own bucket (appended after the declared columns) instead of being
 * silently dropped - a stale/unexpected value should stay visible, not
 * disappear.
 */
export function useGroupBy<T>(
  items: T[],
  axis: GroupByAxis<T> | null
): GroupByBucket<T>[] {
  return useMemo(() => {
    if (!axis) {
      return [{ column: SINGLE_BUCKET_COLUMN, items }];
    }

    const buckets = new Map<string, T[]>();
    for (const column of axis.columns) {
      buckets.set(column, []);
    }

    for (const item of items) {
      const column = axis.columnFor(item);
      const existing = buckets.get(column);
      if (existing) {
        existing.push(item);
      } else {
        buckets.set(column, [item]);
      }
    }

    const declared = axis.columns.map((column) => ({
      column,
      items: buckets.get(column) ?? [],
    }));
    const extra = Array.from(buckets.entries())
      .filter(([column]) => !axis.columns.includes(column))
      .map(([column, columnItems]) => ({ column, items: columnItems }));

    return [...declared, ...extra];
  }, [items, axis]);
}
