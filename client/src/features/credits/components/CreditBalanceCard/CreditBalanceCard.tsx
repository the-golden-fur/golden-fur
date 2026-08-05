import { useEffect, useState } from 'react';
import type { CreditBalance, CreditTransaction } from '../../credits.types';
import styles from './CreditBalanceCard.module.css';

/**
 * Illustrative only, per the Guide's own Open Items - "no exact threshold is
 * specified by Modules-Features beyond 'as expiry approaches'... a 7-day
 * example was floated... treat it as illustrative, not confirmed." Not
 * wired to any policy_configurations column - confirm with the requirements
 * owner before treating this as final.
 */
const EXPIRY_LOOKAHEAD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function soonestActiveExpiry(history: CreditTransaction[]): string | null {
  const active = history.filter(
    (txn) =>
      txn.transaction_type === 'issuance' &&
      txn.expired_at === null &&
      txn.expires_at !== null
  );

  if (active.length === 0) return null;

  return active.reduce<string>((soonest, txn) => {
    return txn.expires_at! < soonest ? txn.expires_at! : soonest;
  }, active[0].expires_at!);
}

/** Reading the current time is a side effect, not a pure render computation
 * (react-hooks/purity) - resolved here rather than in a useMemo, mirroring
 * UnavailabilityBlockBadge's own effect-driven status pattern. */
function expiryBadgeText(soonest: string | null): string | null {
  if (!soonest) return null;

  const daysUntil = Math.ceil((new Date(soonest).getTime() - Date.now()) / DAY_MS);

  if (daysUntil > EXPIRY_LOOKAHEAD_DAYS) return null;

  return daysUntil <= 0
    ? 'Expires today'
    : `Expires in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
}

interface CreditBalanceCardProps {
  balance: CreditBalance;
  branchName: string;
  /** Optional - when supplied, an "Expires in N day(s)" badge renders if the
   * soonest not-yet-expired issuance falls within EXPIRY_LOOKAHEAD_DAYS. */
  history?: CreditTransaction[];
}

/** Cashier/Admin (#95) and customer portal (#95) balance display - reuses
 * --color-accent-gold-primary (Sprint 5 Epic A's own available-credit hue)
 * and the baseline warning tokens for the expiry-approaching badge. */
export function CreditBalanceCard({
  balance,
  branchName,
  history = [],
}: CreditBalanceCardProps) {
  const [expiryBadge, setExpiryBadge] = useState<string | null>(null);

  useEffect(() => {
    // Deferred to a real callback boundary (react-hooks/set-state-in-effect)
    // - reading the current time is a read of an external platform API, not
    // a pure render computation (react-hooks/purity), so it can't happen
    // directly during render either.
    const timer = setTimeout(() => {
      setExpiryBadge(expiryBadgeText(soonestActiveExpiry(history)));
    }, 0);

    return () => clearTimeout(timer);
  }, [history]);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.branchName}>{branchName}</h3>
        <span className={styles.balance}>{formatCurrency(balance.balance)}</span>
      </div>
      {expiryBadge ? (
        <span className={styles.expiryBadge} role="status">
          {expiryBadge}
        </span>
      ) : null}
    </div>
  );
}
