const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Asia/Manila is UTC+8 all year - no DST to account for. */
const MANILA_OFFSET_MS = 8 * HOUR_MS;

function manilaDayIndex(ms: number): number {
  return Math.floor((ms + MANILA_OFFSET_MS) / DAY_MS);
}

/**
 * How overdue a pet is, in the units staff price it by - for display only,
 * so Front Desk can work out what a pay-at-checkout stay will cost:
 * - hours: every started hour since the expected checkout (61 min = 2),
 *   none while still within the grace period - the same rule the Daycare
 *   overdue fee bills by (daycareCharge.util.ts's daycareOverdueCharge);
 * - nights: Manila calendar days since the expected checkout - the same way
 *   a Hotel pay-at-checkout bill counts nights (checkout.service.ts's
 *   stayNights).
 */
export function overdueDuration(
  expectedCheckoutMs: number,
  nowMs: number,
  graceMinutes: number | null
): { hours: number; nights: number } {
  const overdueMs = nowMs - expectedCheckoutMs;

  if (overdueMs <= 0) return { hours: 0, nights: 0 };

  const hours =
    overdueMs / 60000 <= (graceMinutes ?? 0)
      ? 0
      : Math.ceil(overdueMs / HOUR_MS);
  const nights = manilaDayIndex(nowMs) - manilaDayIndex(expectedCheckoutMs);

  return { hours, nights };
}
