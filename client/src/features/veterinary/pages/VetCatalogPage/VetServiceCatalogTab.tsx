import { useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import {
  createServiceCatalogItem,
  deleteServiceCatalogItem,
  listServiceCatalog,
  updateServiceCatalogItem,
} from '../../api/veterinary.api';
import type { VetServiceCatalogItem } from '../../veterinary.types';
import styles from './VetCatalogPage.module.css';

interface VetServiceCatalogTabProps {
  accessToken: string;
}

interface ServiceForm {
  /** null while adding a new entry. */
  id: string | null;
  name: string;
  price: string;
}

const COLUMNS: DataTableColumn<VetServiceCatalogItem>[] = [
  { id: 'name', header: 'Service', render: (item) => item.name },
  {
    id: 'price',
    header: 'Usual price',
    render: (item) => formatCurrency(item.default_price),
  },
];

/**
 * Vet-priced visits: My Catalog > Services - the clinic's shared list of
 * veterinary services and their usual prices (e.g. Major Surgery, 10,000).
 * The "Services done" pop-up a vet fills in when completing a visit suggests
 * from this list and fills in the usual price, which can still be changed
 * per visit. One list for every vet, like Medications.
 *
 * Its own component (loading its own data) rather than more state inside
 * VetCatalogPage, which the other three tabs already make very long. Shares
 * that page's stylesheet so it reads as the same screen.
 */
export function VetServiceCatalogTab({
  accessToken,
}: VetServiceCatalogTabProps) {
  const [services, setServices] = useState<VetServiceCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState<ServiceForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void listServiceCatalog(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the service list.');
        return;
      }

      setServices(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const sortedServices = useMemo(
    () => [...services].sort((a, b) => a.name.localeCompare(b.name)),
    [services]
  );

  function openForm(item: VetServiceCatalogItem | null) {
    setFormError(null);
    setForm(
      item
        ? { id: item.id, name: item.name, price: String(item.default_price) }
        : { id: null, name: '', price: '' }
    );
  }

  async function handleSave() {
    if (!form) return;

    const name = form.name.trim();
    const price = Number(form.price);

    if (name === '') {
      setFormError('Enter the service name.');
      return;
    }
    if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) {
      setFormError('Enter the usual price (0 or more).');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = { name, default_price: price };
    const result = form.id
      ? await updateServiceCatalogItem(form.id, accessToken, payload)
      : await createServiceCatalogItem(accessToken, payload);

    setIsSaving(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not save this service.');
      return;
    }

    const saved = result.data;
    setServices((prev) =>
      prev.some((item) => item.id === saved.id)
        ? prev.map((item) => (item.id === saved.id ? saved : item))
        : [...prev, saved]
    );
    setForm(null);
  }

  async function handleDelete(item: VetServiceCatalogItem) {
    setActionError(null);

    const result = await deleteServiceCatalogItem(item.id, accessToken);

    if (result.error) {
      setActionError(result.error);
      return;
    }

    setServices((prev) => prev.filter((entry) => entry.id !== item.id));
  }

  if (isLoading) {
    return <LoadingState label="Loading services..." />;
  }

  if (loadError) {
    return (
      <p className={styles.errorBanner} role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.copy}>
          Suggested when you list the services done at a visit. The price fills
          in and can still be changed per visit.
        </p>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => openForm(null)}
        >
          Add service
        </button>
      </div>

      {actionError ? (
        <p className={styles.errorBanner} role="alert">
          {actionError}
        </p>
      ) : null}

      <DataTable
        columns={COLUMNS}
        rows={sortedServices}
        getRowKey={(item) => item.id}
        renderRowActions={(item) => (
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              aria-label={`Edit ${item.name}`}
              onClick={() => openForm(item)}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              aria-label={`Delete ${item.name}`}
              onClick={() => void handleDelete(item)}
            >
              Delete
            </button>
          </div>
        )}
        emptyMessage="No services on the list yet. Add the ones you charge for most often."
      />

      <Modal
        isOpen={form !== null}
        title={form?.id ? 'Edit service' : 'Add service'}
        onClose={() => setForm(null)}
        closeOnBackdropClick={false}
      >
        {form ? (
          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Service name</span>
              <input
                className={styles.input}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Usual price (₱)</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
              />
            </label>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={isSaving}
                onClick={() => void handleSave()}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isSaving}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
