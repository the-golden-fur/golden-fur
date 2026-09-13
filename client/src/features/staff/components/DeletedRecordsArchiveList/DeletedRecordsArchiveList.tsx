import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import {
  listDeletedRecordTables,
  listDeletedRecords,
  purgeDeletedRecord,
  restoreDeletedRecord,
} from '../../api/recordsArchive.api';
import type { DeletedRecordArchiveEntry } from '../../staff.types';
import styles from './DeletedRecordsArchiveList.module.css';

const PAGE_SIZE = 20;

type SortOption = 'deleted_at_desc' | 'deleted_at_asc';

/**
 * "As any user, I want any record from any table I delete to be stored in
 * an archive, where I can then query (search, filter, sort, etc.) in the
 * future if I ever need to restore it." Backed by a database trigger that
 * captures EVERY table's deletes (20260913202 migration) - this is the
 * generic query/restore UI over that archive, distinct from ArchiveList
 * (which only ever shows one already-typed entity's own soft-archived
 * rows). Restore re-inserts the row's full captured snapshot back into its
 * original table - it can fail if a dependent row was also deleted or a
 * new row already occupies the same id, surfaced as a plain error message.
 */
export function DeletedRecordsArchiveList({
  accessToken,
}: {
  accessToken: string;
}) {
  const [tables, setTables] = useState<string[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('deleted_at_desc');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<DeletedRecordArchiveEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pendingPurgeId, setPendingPurgeId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => {
    void listDeletedRecordTables(accessToken).then((result) => {
      if (result.data) setTables(result.data);
    });
  }, [accessToken]);

  useEffect(() => {
    let isMounted = true;

    void listDeletedRecords(accessToken, {
      table: tableFilter || undefined,
      search: search.trim() || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(
          result.error ?? 'Could not load the deleted records archive.'
        );
        return;
      }

      setLoadError(null);
      setRows(result.data.rows);
      setTotal(result.data.total);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, tableFilter, search, sort, page]);

  function applyFilterChange(next: () => void) {
    next();
    setPage(1);
  }

  async function handleRestore(id: string) {
    setRowError(null);
    setRestoringId(id);
    const result = await restoreDeletedRecord(accessToken, id);
    setRestoringId(null);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    if (result.data) {
      setRows((prev) =>
        prev.map((row) => (row.id === id ? result.data! : row))
      );
    }
  }

  async function confirmPurge() {
    if (!pendingPurgeId) return;

    setIsPurging(true);
    const result = await purgeDeletedRecord(accessToken, pendingPurgeId);
    setIsPurging(false);

    if (result.error) {
      setRowError(result.error);
      setPendingPurgeId(null);
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== pendingPurgeId));
    setTotal((prev) => Math.max(0, prev - 1));
    setPendingPurgeId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.wrapper}>
      <p className={styles.copy}>
        Every record ever hard-deleted from any table, across the whole app -
        not just what's soft-archived from a specific admin page. Restore
        re-inserts the record's own captured data back into its original table.
      </p>

      <div className={styles.toolbar}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Table</span>
          <select
            className={styles.filterSelect}
            value={tableFilter}
            onChange={(event) =>
              applyFilterChange(() => setTableFilter(event.target.value))
            }
          >
            <option value="">All tables</option>
            {tables.map((table) => (
              <option key={table} value={table}>
                {table}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Search</span>
          <input
            className={styles.filterSelect}
            type="search"
            placeholder="Search deleted records..."
            value={search}
            onChange={(event) =>
              applyFilterChange(() => setSearch(event.target.value))
            }
          />
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Sort</span>
          <select
            className={styles.filterSelect}
            value={sort}
            onChange={(event) =>
              applyFilterChange(() => setSort(event.target.value as SortOption))
            }
          >
            <option value="deleted_at_desc">Newest first</option>
            <option value="deleted_at_asc">Oldest first</option>
          </select>
        </label>
      </div>

      {rowError ? (
        <p className={styles.errorBanner} role="alert">
          {rowError}
        </p>
      ) : null}

      {isLoading ? (
        <p className={styles.copy}>Loading...</p>
      ) : loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.copy}>No deleted records match this filter.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li className={styles.listItem} key={row.id}>
              <div className={styles.listItemMain}>
                <span className={styles.tableBadge}>{row.source_table}</span>
                <span className={styles.itemLabel}>
                  {row.record_id ?? '(no id)'}
                </span>
                <span className={styles.deletedAt}>
                  Deleted {new Date(row.deleted_at).toLocaleString()}
                  {row.restored_at ? ' · Restored' : ''}
                </span>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.viewButton}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === row.id ? null : row.id
                      )
                    }
                  >
                    {expandedId === row.id ? 'Hide details' : 'View details'}
                  </button>
                  <button
                    type="button"
                    className={styles.restoreButton}
                    disabled={
                      Boolean(row.restored_at) || restoringId === row.id
                    }
                    onClick={() => void handleRestore(row.id)}
                  >
                    {restoringId === row.id ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => setPendingPurgeId(row.id)}
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
              {expandedId === row.id ? (
                <pre className={styles.jsonPreview}>
                  {JSON.stringify(row.row_data, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageButton}
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className={styles.copy}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            Next
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={pendingPurgeId !== null}
        title="Permanently delete this archive entry?"
        body="This removes the archived copy itself - once gone, this record can no longer be restored."
        confirmLabel="Delete permanently"
        tone="danger"
        isConfirming={isPurging}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPendingPurgeId(null)}
      />
    </div>
  );
}
