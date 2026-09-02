import type { CreditTransaction } from '../credits.types';

/**
 * Credit-expiry maths shared by the per-branch card, the dedicated credits
 * page, and the navbar pill's hover popover.
 *
 * Everything here is pure - `now` (a `Date.now()` millisecond value) is
 * passed in, never read inside, so callers keep the "reading the clock is a
 * side effect" rule (resolve it in an effect / event handler, not render).
 *
 * Credit expires per **calendar day** in the business's timezone
 * (Asia/Manila, UTC+8, no DST). Lots issued hours apart on the same day
 * therefore expire together, and the shown date always matches the shown
 * "N days left". This mirrors the server (creditExpiry.util.ts) and how
 * lots' expires_at is stamped.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_TZ = 'Asia/Manila';

export interface ExpiryEntry {
  /** ISO instant this slice of credit expires (end of its Manila day). */
  expiresAt: string;
  /** Pesos expiring then - FIFO-capped at the running balance, so credit
   * already spent via redemptions isn't double-counted. */
  amount: number;
  /** Whole days from `now` to the expiry day; 0 = today, negative = past. */
  daysLeft: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "YYYY-MM-DD" for the Manila calendar day an instant falls on. */
function manilaDay(instant: string | number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(
    new Date(instant)
  );
}

/** Not-yet-swept issuance lots that carry an expiry date, oldest first. */
export function activeExpiringLots(
  history: CreditTransaction[]
): CreditTransaction[] {
  return history
    .filter(
      (txn) =>
        txn.transaction_type === 'issuance' &&
        txn.expired_at === null &&
        txn.expires_at !== null
    )
    .sort((a, b) => (a.expires_at ?? '').localeCompare(b.expires_at ?? ''));
}

/** Whole calendar days (Manila) from `now` to the day `iso` falls on. */
export function daysUntil(iso: string, now: number): number {
  const target = Date.parse(`${manilaDay(iso)}T00:00:00+08:00`);
  const today = Date.parse(`${manilaDay(now)}T00:00:00+08:00`);
  return Math.round((target - today) / DAY_MS);
}

export function formatExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "Expires today" / "1 day left" / "12 days left" / "Expired". */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) return 'Expired';
  if (daysLeft === 0) return 'Expires today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

/**
 * Every future expiry event for one branch balance, oldest first - the same
 * FIFO / "only down to the current balance" rule expire_credits() applies:
 * the lots on each Manila day lose min(their nominal, whatever balance is
 * still unspent as we walk forward). Lots fully covered by past redemptions
 * contribute nothing.
 */
export function computeExpirySchedule(
  history: CreditTransaction[],
  balance: number,
  now: number
): ExpiryEntry[] {
  // Bucket the (ascending) lots by Manila calendar day.
  const buckets: { day: string; nominal: number }[] = [];
  for (const lot of activeExpiringLots(history)) {
    const day = manilaDay(lot.expires_at as string);
    const last = buckets[buckets.length - 1];
    if (last && last.day === day) last.nominal += lot.amount;
    else buckets.push({ day, nominal: lot.amount });
  }

  const entries: ExpiryEntry[] = [];
  let remaining = balance;
  for (const bucket of buckets) {
    if (remaining <= 0) break;
    const amount = Math.min(bucket.nominal, remaining);
    remaining -= amount;
    if (amount > 0) {
      const expiresAt = new Date(
        `${bucket.day}T23:59:59.999+08:00`
      ).toISOString();
      entries.push({
        expiresAt,
        amount: round2(amount),
        daysLeft: daysUntil(expiresAt, now),
      });
    }
  }

  return entries;
}

/** The soonest upcoming expiry, or null when this balance never expires (or
 * is zero). `schedule[0]` - kept as its own helper for the common "just the
 * headline" case. */
export function soonestExpiry(
  history: CreditTransaction[],
  balance: number,
  now: number
): ExpiryEntry | null {
  return computeExpirySchedule(history, balance, now)[0] ?? null;
}
