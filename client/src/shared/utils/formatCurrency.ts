/**
 * Peso amount as `₱1,234.00` (en-PH grouping, always 2 decimals). Small
 * shared helper - CreditBalanceCard, CreditHistoryTable, and the navbar
 * credit indicator all format money the same way.
 */
export function formatCurrency(amount: number): string {
  // Coerce first: PG `numeric` columns come back from PostgREST as strings,
  // and `String.prototype.toLocaleString` silently ignores the options
  // (printing the raw, ungrouped value) instead of throwing.
  const value = Number(amount);
  return `₱${(Number.isFinite(value) ? value : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
