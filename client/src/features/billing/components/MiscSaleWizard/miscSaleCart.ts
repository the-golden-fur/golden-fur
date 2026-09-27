import type { CatalogComboBoxItem } from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import type { MiscSaleItem } from '../../billing.types';

/** One row of the wizard's Products step - a hybrid catalog/freetext combo
 * value (same shape CatalogComboBox already uses) plus its own
 * quantity/freetext amount, so multiple items can be picked at once. */
export interface CartRow {
  id: string;
  catalogId: string | null;
  text: string;
  quantity: number;
  freetextAmount: string;
}

export function emptyCartRow(id: string): CartRow {
  return { id, catalogId: null, text: '', quantity: 1, freetextAmount: '' };
}

export function isCartRowValid(row: CartRow): boolean {
  if (row.catalogId) return true;
  return row.text.trim().length > 0 && Number(row.freetextAmount) > 0;
}

export function isCartValid(rows: CartRow[]): boolean {
  return rows.length > 0 && rows.every(isCartRowValid);
}

export function cartRowSubtotal(
  row: CartRow,
  products: CatalogComboBoxItem[]
): number {
  if (row.catalogId) {
    const product = products.find((item) => item.id === row.catalogId);
    return (product?.price ?? 0) * row.quantity;
  }
  return Number(row.freetextAmount) || 0;
}

export function cartSubtotal(
  rows: CartRow[],
  products: CatalogComboBoxItem[]
): number {
  return rows.reduce((sum, row) => sum + cartRowSubtotal(row, products), 0);
}

/** Builds the createMiscSale/previewMiscSale request shape - only valid rows
 * are converted (an in-progress empty row is silently dropped rather than
 * sent as a malformed item, since Next is already disabled until every row
 * is valid). */
export function buildMiscSaleItems(rows: CartRow[]): MiscSaleItem[] {
  return rows
    .filter(isCartRowValid)
    .map((row) =>
      row.catalogId
        ? { product_catalog_id: row.catalogId, quantity: row.quantity }
        : { description: row.text.trim(), amount: Number(row.freetextAmount) }
    );
}
