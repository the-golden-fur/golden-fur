import type { CSSProperties, ReactNode } from 'react';
import type { GroupByBucket } from '../../hooks/useGroupBy/useGroupBy';
import styles from './DataBoard.module.css';

interface DataBoardProps<T> {
  /** Output of `useGroupBy` - already-bucketed, already-ordered columns. */
  groups: GroupByBucket<T>[];
  getRowKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  /** Defaults to the column key + a count badge. Override for something like
   * a status badge (see TransactionBoard's PaymentStatusBadge use). */
  renderColumnHeader?: (column: string, count: number) => ReactNode;
  emptyColumnMessage?: string;
}

/**
 * Generic Kanban/board view - the "Board" option in a page's view switcher.
 * Generalizes TransactionBoard's (fixed 3-column) and
 * BoardingChecklistKanban's (selectable-axis) column-grid rendering into one
 * reusable shell; grouping itself is `useGroupBy`'s job, this component only
 * lays the resulting buckets out as columns.
 */
export function DataBoard<T>({
  groups,
  getRowKey,
  renderCard,
  renderColumnHeader,
  emptyColumnMessage = 'Nothing here.',
}: DataBoardProps<T>) {
  return (
    <div
      className={styles.board}
      style={{ '--column-count': groups.length } as CSSProperties}
    >
      {groups.map((group) => (
        <section key={group.column} className={styles.column}>
          <h3 className={styles.columnTitle}>
            {renderColumnHeader ? (
              renderColumnHeader(group.column, group.items.length)
            ) : (
              <>
                <span>{group.column}</span>
                <span className={styles.columnCount}>{group.items.length}</span>
              </>
            )}
          </h3>

          {group.items.length === 0 ? (
            <p className={styles.empty}>{emptyColumnMessage}</p>
          ) : (
            group.items.map((item) => (
              <div key={getRowKey(item)}>{renderCard(item)}</div>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
