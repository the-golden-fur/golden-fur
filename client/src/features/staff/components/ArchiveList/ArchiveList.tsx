import { useEffect, useMemo, useState } from 'react';
import { Columns3, Table } from 'lucide-react';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { ViewSwitcher } from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import styles from './ArchiveList.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

interface ArchiveApiResult<T> {
  data: T | null;
  error: string | null;
}

interface ArchivedRow {
  id: string;
  archived_at?: string | null;
}

interface ArchiveListProps<T extends ArchivedRow> {
  entityLabel: string;
  accessToken: string;
  fetchArchived: (accessToken: string) => Promise<ArchiveApiResult<T[]>>;
  restoreItem: (
    itemId: string,
    accessToken: string
  ) => Promise<ArchiveApiResult<null>>;
  hardDeleteItem: (
    itemId: string,
    accessToken: string
  ) => Promise<ArchiveApiResult<null>>;
  renderLabel: (item: T) => string;
}

type SortKey = 'name-asc' | 'name-desc' | 'archived-desc' | 'archived-asc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'archived-desc', label: 'Archived date (newest)' },
  { value: 'archived-asc', label: 'Archived date (oldest)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
];

type GroupBy = 'none' | 'month';

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'month', label: 'Archived month' },
];

type ViewMode = 'list' | 'table';

function archivedTime(item: ArchivedRow): number {
  return item.archived_at ? new Date(item.archived_at).getTime() : 0;
}

function monthGroupKey(item: ArchivedRow): string {
  if (!item.archived_at) return 'Unknown';
  return new Date(item.archived_at).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Shared final-decision view for the archive workflow (Products, Staff,
 * Customers/Pets, and every other archivable config entity): Restore is a
 * single click (non-destructive), Hard Delete requires confirming through
 * ConfirmDialog since it's irreversible. Parametrized by entity rather than
 * duplicated many times over.
 *
 * Search/sort/group-by/view controls are deliberately generic: every one of
 * this component's 15 callers hands it a different item shape, and the only
 * fields they all share are a label string (renderLabel) and an
 * archived_at timestamp - so those are the only two dimensions offered,
 * rather than a per-entity filter set each caller would have to define.
 */
export function ArchiveList<T extends ArchivedRow>({
  entityLabel,
  accessToken,
  fetchArchived,
  restoreItem,
  hardDeleteItem,
  renderLabel,
}: ArchiveListProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('archived-desc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [view, setView] = useState<ViewMode>('list');

  useEffect(() => {
    let isMounted = true;

    void fetchArchived(accessToken).then((result) => {
      if (!isMounted) return;
      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? `Could not load archived ${entityLabel}.`);
        return;
      }

      setItems(result.data);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleRestore(itemId: string) {
    setRowError(null);
    const result = await restoreItem(itemId, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  async function confirmHardDelete() {
    if (!pendingDeleteId) return;

    setIsDeleting(true);
    const result = await hardDeleteItem(pendingDeleteId, accessToken);
    setIsDeleting(false);

    if (result.error) {
      setRowError(result.error);
      setPendingDeleteId(null);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== pendingDeleteId));
    setPendingDeleteId(null);
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? items.filter((item) => renderLabel(item).toLowerCase().includes(query))
      : items;

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'name-asc') {
        return renderLabel(a).localeCompare(renderLabel(b));
      }
      if (sortKey === 'name-desc') {
        return renderLabel(b).localeCompare(renderLabel(a));
      }
      if (sortKey === 'archived-asc') {
        return archivedTime(a) - archivedTime(b);
      }
      return archivedTime(b) - archivedTime(a);
    });

    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, sortKey]);

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [
        { key: 'all', title: null as string | null, items: visibleItems },
      ];
    }

    const byMonth = new Map<string, T[]>();
    for (const item of visibleItems) {
      const key = monthGroupKey(item);
      const bucket = byMonth.get(key) ?? [];
      bucket.push(item);
      byMonth.set(key, bucket);
    }
    return Array.from(byMonth, ([title, groupItems]) => ({
      key: title,
      title,
      items: groupItems,
    }));
  }, [visibleItems, groupBy]);

  function renderActions(item: T) {
    return (
      <>
        <button
          type="button"
          className={styles.restoreButton}
          onClick={() => void handleRestore(item.id)}
        >
          Restore
        </button>
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => setPendingDeleteId(item.id)}
        >
          Delete permanently
        </button>
      </>
    );
  }

  if (isLoading) {
    return <LoadingState label={`Loading archived ${entityLabel}...`} />;
  }

  if (loadError) {
    return (
      <p className={styles.errorBanner} role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      {rowError ? (
        <p className={styles.errorBanner} role="alert">
          {rowError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className={styles.copy}>No archived {entityLabel}.</p>
      ) : (
        <>
          <div className={styles.controls}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder={`Search archived ${entityLabel}...`}
              aria-label={`Search archived ${entityLabel}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label className={styles.controlField}>
              <span className={styles.controlLabel}>Sort</span>
              <select
                className={styles.controlSelect}
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.controlField}>
              <span className={styles.controlLabel}>Group by</span>
              <select
                className={styles.controlSelect}
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              >
                {GROUP_BY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ViewSwitcher
              ariaLabel={`${entityLabel} view`}
              options={[
                { value: 'list', label: 'List', icon: Columns3 },
                { value: 'table', label: 'Table', icon: Table },
              ]}
              value={view}
              onChange={setView}
            />
          </div>

          {visibleItems.length === 0 ? (
            <p className={styles.copy}>
              No archived {entityLabel} match this search.
            </p>
          ) : view === 'table' ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Archived</th>
                  <th />
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.key}>
                  {group.title ? (
                    <tr className={styles.groupRow}>
                      <th scope="colgroup" colSpan={3}>
                        {group.title}
                      </th>
                    </tr>
                  ) : null}
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td>{renderLabel(item)}</td>
                      <td className={styles.archivedAt}>
                        {item.archived_at
                          ? new Date(item.archived_at).toLocaleDateString()
                          : ''}
                      </td>
                      <td className={styles.tableActions}>
                        {renderActions(item)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          ) : (
            <div className={styles.groupedList}>
              {groups.map((group) => (
                <div key={group.key}>
                  {group.title ? (
                    <h3 className={styles.groupTitle}>{group.title}</h3>
                  ) : null}
                  <ul className={styles.list}>
                    {group.items.map((item) => (
                      <li className={styles.listItem} key={item.id}>
                        <span className={styles.itemLabel}>
                          {renderLabel(item)}
                        </span>
                        <span className={styles.archivedAt}>
                          Archived{' '}
                          {item.archived_at
                            ? new Date(item.archived_at).toLocaleDateString()
                            : ''}
                        </span>
                        {renderActions(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        title={`Permanently delete this ${entityLabel.replace(/s$/, '')}?`}
        body="This cannot be undone. The record will be permanently removed."
        confirmLabel="Delete permanently"
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={() => void confirmHardDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
