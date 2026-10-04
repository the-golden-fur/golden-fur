/**
 * The Daycare overdue fee a pet has run up so far, for display only - the
 * amount actually billed is computed by the server at checkout
 * (daycareCharge.util.ts's daycareOverdueCharge, which this mirrors): free up
 * to the grace period, then the flat fee for every started hour since the
 * expected checkout.
 */
export function overdueFeeSoFar(
  overdueMs: number,
  feePerHour: number,
  graceMinutes: number | null
): number {
  const overdueMinutes = overdueMs / 60000;

  if (overdueMinutes <= (graceMinutes ?? 0)) return 0;

  return Math.ceil(overdueMinutes / 60) * feePerHour;
}
