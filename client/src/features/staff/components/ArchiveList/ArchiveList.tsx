import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import styles from './ArchiveList.module.css';

interface ArchiveApiResult<T> {
  data: T | null;
  error: string | null;
}

interface ArchivedRow {
  id: string;
  archived_at: string | null;
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

/**
 * Shared final-decision view for the archive workflow (Products, Staff,
 * Customers/Pets): Restore is a single click (non-destructive), Hard Delete
 * requires confirming through ConfirmDialog since it's irreversible.
 * Parametrized by entity rather than duplicated three times.
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

  if (isLoading) {
    return <p className={styles.copy}>Loading archived {entityLabel}...</p>;
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
        <ul className={styles.list}>
          {items.map((item) => (
            <li className={styles.listItem} key={item.id}>
              <span className={styles.itemLabel}>{renderLabel(item)}</span>
              <span className={styles.archivedAt}>
                Archived{' '}
                {item.archived_at
                  ? new Date(item.archived_at).toLocaleDateString()
                  : ''}
              </span>
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
            </li>
          ))}
        </ul>
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
