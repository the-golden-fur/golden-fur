import type { ReactNode } from 'react';
import { CardContextMenu } from '../MoreOptionsMenu/CardContextMenu';
import type { MoreOptionsMenuItem } from '../MoreOptionsMenu/MoreOptionsMenu';
import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  /** Stable key for the column (also used as the React key). */
  id: string;
  header: string;
  render: (item: T) => ReactNode;
  /** Right-align a column's header/cells - e.g. a price or a count. */
  align?: 'start' | 'end';
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  /** Already client-filtered, searched, and sorted by the page. */
  rows: T[];
  getRowKey: (item: T) => string;
  /** Trailing column, e.g. an Edit/Delete button or a MoreOptionsMenu. */
  renderRowActions?: (item: T) => ReactNode;
  /** Optional right-click / press-and-hold menu for a whole row (same
   * CardContextMenu card views use). Return null, or no items, for a row
   * with nothing to offer - its cells then render untouched. */
  getRowContextMenu?: (
    item: T
  ) => { label: string; items: MoreOptionsMenuItem[] } | null;
  emptyMessage?: string;
}

/**
 * Generic spreadsheet-style table view - the "Table" option in a page's view
 * switcher. Replaces the hand-rolled `<table>` every list page used to write
 * from scratch. Owns no state of its own: sorting/filtering/grouping happen
 * upstream (via FilterSortBar + a page's own adapter), this component only
 * renders whatever rows it's handed.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  renderRowActions,
  getRowContextMenu,
  emptyMessage = 'Nothing here yet.',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={
                  column.align === 'end' ? styles.headEnd : styles.head
                }
              >
                {column.header}
              </th>
            ))}
            {renderRowActions ? (
              <th
                scope="col"
                className={styles.headActions}
                aria-label="Actions"
              />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const contextMenu = getRowContextMenu?.(row);
            const hasContextMenu = Boolean(contextMenu?.items.length);

            return (
              <tr key={getRowKey(row)} className={styles.row}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={
                      column.align === 'end' ? styles.cellEnd : styles.cell
                    }
                  >
                    {/* A <tr> can't take a wrapper element, so each cell
                        carries the same row menu. */}
                    {hasContextMenu && contextMenu ? (
                      <CardContextMenu
                        label={contextMenu.label}
                        items={contextMenu.items}
                      >
                        {column.render(row)}
                      </CardContextMenu>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
                {renderRowActions ? (
                  <td className={styles.cellActions}>
                    {renderRowActions(row)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
