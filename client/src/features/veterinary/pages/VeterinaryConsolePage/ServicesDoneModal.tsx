import { useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import type {
  ServiceDone,
  VetServiceCatalogItem,
} from '../../veterinary.types';
import styles from './ServicesDoneModal.module.css';

export interface ServicesDoneModalProps {
  petName: string;
  /** The clinic's shared service list (My Catalog > Services) - offered as
   * suggestions; picking one fills in its usual price. */
  catalog: VetServiceCatalogItem[];
  isSaving: boolean;
  /** A save error from the server, shown until the next attempt. */
  error: string | null;
  /** The vet confirmed - complete the visit with these services billed.
   * An empty list completes it with nothing extra to charge. */
  onConfirm: (lines: ServiceDone[]) => void;
  onCancel: () => void;
}

interface Row {
  id: number;
  name: string;
  /** Kept as typed, so a half-entered number isn't fought over. */
  amount: string;
  /** True while `amount` is still the list price this component filled in -
   * only then may a different pick replace it. Typing a price clears it. */
  amountFromList: boolean;
}

let nextRowId = 1;

function blankRow(): Row {
  return { id: nextRowId++, name: '', amount: '', amountFromList: false };
}

function isBlank(row: Row): boolean {
  return row.name.trim() === '' && row.amount.trim() === '';
}

/**
 * Vet-priced visits: the pop-up every "Complete" opens - what was done for
 * this pet, and what each item costs (e.g. Surgery, 10,000). One per visit.
 *
 * Each line is type-or-pick: the name box suggests the shared service list,
 * and a name that is on it (in any letter case) brings its usual price,
 * which the vet can still change for this visit; anything else can simply be
 * typed with its own price. Mounted only while open, so it always starts
 * from one empty line.
 */
export function ServicesDoneModal({
  petName,
  catalog,
  isSaving,
  error,
  onConfirm,
  onCancel,
}: ServicesDoneModalProps) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [problem, setProblem] = useState<string | null>(null);

  function updateRow(id: number, patch: Partial<Row>) {
    setProblem(null);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function changeName(row: Row, name: string) {
    const listed = catalog.find(
      (item) => item.name.toLowerCase() === name.trim().toLowerCase()
    );
    const mayFillPrice = row.amount.trim() === '' || row.amountFromList;

    if (listed && mayFillPrice) {
      updateRow(row.id, {
        name,
        amount: String(listed.default_price),
        amountFromList: true,
      });
      return;
    }

    updateRow(row.id, { name });
  }

  function removeRow(id: number) {
    setProblem(null);
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  const filledRows = rows.filter((row) => !isBlank(row));
  const total = filledRows.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );

  function handleConfirm() {
    const unnamed = filledRows.find((row) => row.name.trim() === '');
    if (unnamed) {
      setProblem(
        `Give the ${formatCurrency(Number(unnamed.amount) || 0)} service a name, or remove it.`
      );
      return;
    }

    const unpriced = filledRows.find(
      (row) =>
        row.amount.trim() === '' ||
        !Number.isFinite(Number(row.amount)) ||
        Number(row.amount) < 0
    );
    if (unpriced) {
      setProblem(
        `Enter a price for ${unpriced.name.trim()} (0 if it is free), or remove it.`
      );
      return;
    }

    onConfirm(
      filledRows.map((row) => ({
        name: row.name.trim(),
        amount: Number(row.amount),
      }))
    );
  }

  const shownError = problem ?? error;

  return (
    <Modal
      isOpen
      title={`Services done for ${petName}`}
      onClose={onCancel}
      closeOnBackdropClick={false}
    >
      <div className={styles.body}>
        <p className={styles.copy}>
          List what was done at this visit and what each costs. The customer is
          billed for these on top of what was booked. Leave it empty if there is
          nothing more to charge.
        </p>

        <ul className={styles.rows}>
          {rows.map((row, index) => (
            <li key={row.id} className={styles.row}>
              <input
                className={styles.input}
                list="services-done-options"
                aria-label={`Service ${index + 1} name`}
                placeholder="Service (e.g. Surgery)"
                value={row.name}
                onChange={(event) => changeName(row, event.target.value)}
              />
              <input
                className={`${styles.input} ${styles.price}`}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                aria-label={`Service ${index + 1} price`}
                placeholder="Price (₱)"
                value={row.amount}
                onChange={(event) =>
                  updateRow(row.id, {
                    amount: event.target.value,
                    amountFromList: false,
                  })
                }
              />
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`Remove service ${index + 1}`}
                onClick={() => removeRow(row.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <datalist id="services-done-options">
          {catalog.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => {
              setProblem(null);
              setRows((prev) => [...prev, blankRow()]);
            }}
          >
            Add service
          </button>
          <p className={styles.total}>Total: {formatCurrency(total)}</p>
        </div>

        {shownError ? (
          <p className={styles.errorBanner} role="alert">
            {shownError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSaving}
            onClick={handleConfirm}
          >
            {isSaving ? 'Completing...' : 'Complete consultation'}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            disabled={isSaving}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
