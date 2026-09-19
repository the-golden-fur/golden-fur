import type { ReactNode } from 'react';
import styles from './DataList.module.css';

interface DataListProps<T> {
  /** Already client-filtered, searched, and sorted by the page. */
  items: T[];
  getRowKey: (item: T) => string;
  /** The full content of one row/card - the page owns its internal layout. */
  renderItem: (item: T) => ReactNode;
  emptyMessage?: string;
}

/**
 * Generic card-style list view - Notion's "List" view. Formalizes the
 * `.list`/`.listItem` markup pattern that used to be duplicated, slightly
 * differently, in almost every admin CRUD page's own CSS module.
 */
export function DataList<T>({
  items,
  getRowKey,
  renderItem,
  emptyMessage = 'Nothing here yet.',
}: DataListProps<T>) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li className={styles.listItem} key={getRowKey(item)}>
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
