import type {
  PricingCell,
  PricingCellOverrideRow,
} from '../maintenance.types.ts';
import type { GroomingMatrixCell } from './deriveGroomingMatrix.ts';

/**
 * Custom change (per-item weight x coat pricing): lays a service's or
 * package's own Superadmin-set prices over the shared formula's 8 cells
 * (deriveGroomingMatrix). A cell with no override keeps the formula's price.
 */
export function mergePriceCells(
  derived: GroomingMatrixCell[],
  overrides: PricingCellOverrideRow[] | null | undefined
): PricingCell[] {
  return derived.map((cell) => {
    const override = (overrides ?? []).find(
      (row) =>
        row.weight_class === cell.weight_class &&
        row.coat_type === cell.coat_type
    );

    return override
      ? { ...cell, price: Number(override.price), is_custom: true }
      : { ...cell, is_custom: false };
  });
}
