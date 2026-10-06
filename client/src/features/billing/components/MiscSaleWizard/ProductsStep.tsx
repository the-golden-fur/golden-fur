import {
  CatalogComboBox,
  type CatalogComboBoxItem,
} from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import {
  cartRowSubtotal,
  cartSubtotal,
  isCartValid,
  type CartRow,
} from './miscSaleCart';
import styles from './MiscSaleWizard.module.css';

interface ProductsStepProps {
  products: CatalogComboBoxItem[];
  rows: CartRow[];
  onRowsChange: (rows: CartRow[]) => void;
}

/**
 * Step 2 of the misc-sale wizard (session 115): multiple products can now
 * be picked, each its own row - either a catalog item (with a quantity) or
 * a freetext description + amount, the same hybrid shape the old
 * single-item form already used, just repeatable. Mirrors the array
 * add/update/remove-by-index pattern CustomerBookingFlowPage's Care
 * Instructions step already established for "multiple rows with a
 * quantity" (there's no true multi-select-with-quantity precedent
 * elsewhere in the app).
 */
export function ProductsStep({
  products,
  rows,
  onRowsChange,
}: ProductsStepProps) {
  function updateRow(id: string, patch: Partial<CartRow>) {
    onRowsChange(
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function removeRow(id: string) {
    onRowsChange(rows.filter((row) => row.id !== id));
  }

  // A new row only once every existing one is filled in (a product, or a
  // description + amount) - no stacking up blank rows.
  const canAddRow = isCartValid(rows);

  function addRow() {
    if (!canAddRow) return;
    onRowsChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        catalogId: null,
        text: '',
        quantity: 1,
        freetextAmount: '',
      },
    ]);
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>Products</span>
      <div className={styles.cartRows}>
        {rows.map((row) => (
          <div key={row.id} className={styles.cartRow}>
            <CatalogComboBox
              items={products}
              value={{ catalogId: row.catalogId, text: row.text }}
              onChange={(next) =>
                updateRow(row.id, {
                  catalogId: next.catalogId,
                  text: next.text,
                })
              }
              placeholder="Search products or type a custom item..."
            />
            {row.catalogId ? (
              <input
                className={styles.quantityInput}
                type="number"
                min="1"
                step="1"
                value={row.quantity}
                onChange={(event) =>
                  updateRow(row.id, {
                    quantity: Number(event.target.value) || 1,
                  })
                }
                aria-label="Quantity"
              />
            ) : (
              <input
                className={styles.amountInput}
                type="number"
                min="0.01"
                step="0.01"
                value={row.freetextAmount}
                onChange={(event) =>
                  updateRow(row.id, { freetextAmount: event.target.value })
                }
                placeholder="Amount"
                aria-label="Amount (PHP)"
              />
            )}
            <button
              type="button"
              className={styles.smallButtonDanger}
              disabled={rows.length === 1}
              onClick={() => removeRow(row.id)}
            >
              Remove
            </button>
            <span className={styles.cartRowTotal}>
              {formatCurrency(cartRowSubtotal(row, products))}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={styles.smallButton}
        disabled={!canAddRow}
        aria-describedby={canAddRow ? undefined : 'add-item-hint'}
        onClick={addRow}
      >
        Add another item
      </button>
      {canAddRow ? null : (
        <p id="add-item-hint" className={styles.copy}>
          Fill in the product and amount above to add another item.
        </p>
      )}
      <p className={styles.summaryLineTotal}>
        <span>Subtotal</span>
        <span>{formatCurrency(cartSubtotal(rows, products))}</span>
      </p>
    </div>
  );
}
