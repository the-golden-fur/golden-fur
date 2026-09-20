import {
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react';
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
  /** When provided, each column header becomes a drag handle for manually
   * reordering columns - called with (draggedColumn, dropTargetColumn) on a
   * successful drop, which the caller turns into a new manual order (see
   * `moveColumnBefore` in useGroupBy). Omit this to leave headers static -
   * a page should only pass it while its own "Sort groups" control is set
   * to Manual, since dragging a derived (e.g. Alphabetical) order wouldn't
   * persist anywhere. */
  onReorderColumn?: (dragged: string, target: string) => void;
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
  onReorderColumn,
}: DataBoardProps<T>) {
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  function handleDragStart(column: string) {
    return (event: DragEvent<HTMLHeadingElement>) => {
      setDraggedColumn(column);
      event.dataTransfer.effectAllowed = 'move';
    };
  }

  function handleDragEnd() {
    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  function handleDragOver(column: string) {
    return (event: DragEvent<HTMLElement>) => {
      // Required for this element to become a valid drop target at all.
      event.preventDefault();
      if (column !== dragOverColumn) setDragOverColumn(column);
    };
  }

  function handleDrop(column: string) {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (draggedColumn && draggedColumn !== column) {
        onReorderColumn?.(draggedColumn, column);
      }
      setDraggedColumn(null);
      setDragOverColumn(null);
    };
  }

  return (
    <div
      className={styles.board}
      style={{ '--column-count': groups.length } as CSSProperties}
    >
      {groups.map((group) => (
        <section
          key={group.column}
          className={
            onReorderColumn && dragOverColumn === group.column
              ? `${styles.column} ${styles.columnDragOver}`
              : styles.column
          }
          onDragOver={
            onReorderColumn ? handleDragOver(group.column) : undefined
          }
          onDragLeave={
            onReorderColumn
              ? () =>
                  setDragOverColumn((current) =>
                    current === group.column ? null : current
                  )
              : undefined
          }
          onDrop={onReorderColumn ? handleDrop(group.column) : undefined}
        >
          <h3
            className={
              onReorderColumn
                ? `${styles.columnTitle} ${styles.columnTitleDraggable}`
                : styles.columnTitle
            }
            draggable={Boolean(onReorderColumn)}
            onDragStart={
              onReorderColumn ? handleDragStart(group.column) : undefined
            }
            onDragEnd={onReorderColumn ? handleDragEnd : undefined}
          >
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
