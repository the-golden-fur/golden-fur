/**
 * Peso amount as `₱1,234.00` (en-PH grouping, always 2 decimals). Small
 * shared helper - CreditBalanceCard, CreditHistoryTable, and the navbar
 * credit indicator all format money the same way.
 */
export function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
