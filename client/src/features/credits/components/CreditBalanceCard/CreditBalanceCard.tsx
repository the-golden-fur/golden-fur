import { useState } from 'react';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import type { CreditBalance, CreditTransaction } from '../../credits.types';
import {
  activeExpiringLots,
  describeDaysLeft,
  formatExpiryDate,
  soonestExpiry,
} from '../../utils/expiry';
import styles from './CreditBalanceCard.module.css';

/** Below this many days the "expires" line turns into a warning colour. */
const EXPIRY_WARNING_DAYS = 7;

interface CreditBalanceCardProps {
  balance: CreditBalance;
  branchName: string;
  /** Issuance/redemption/expiry rows for this (customer, branch) - when
   * supplied, the card shows the soonest upcoming expiry (date + amount +
   * days left) or "Does not expire". */
  history?: CreditTransaction[];
}

/** Cashier/Admin (#95) and customer credits page balance display - reuses
 * --color-accent-gold-primary (the available-credit hue) and the baseline
 * warning tokens for an expiry that's close. */
export function CreditBalanceCard({
  balance,
  branchName,
  history = [],
}: CreditBalanceCardProps) {
  // Read the clock once at mount (react-hooks/purity - not during render),
  // same pattern as ReceptionistBookingsQueuePage's date state. "Days left"
  // doesn't need to tick while the card is on screen.
  const [now] = useState(() => Date.now());

  // Only speak to expiry when history is actually loaded - the staff
  // CreditManagementPage passes [] until a branch is expanded, and "Does not
  // expire" must not show just because we haven't looked yet.
  const expiryKnown = history.length > 0;
  const next = expiryKnown
    ? soonestExpiry(history, balance.balance, now)
    : null;
  const neverExpires =
    expiryKnown &&
    balance.balance > 0 &&
    activeExpiringLots(history).length === 0;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.branchName}>{branchName}</h3>
        <span className={styles.balance}>
          {formatCurrency(balance.balance)}
        </span>
      </div>

      {next ? (
        <span
          className={
            next.daysLeft <= EXPIRY_WARNING_DAYS
              ? styles.expiryWarning
              : styles.expiryNote
          }
          role="status"
        >
          {formatCurrency(next.amount)} expires{' '}
          {formatExpiryDate(next.expiresAt)} &middot;{' '}
          {describeDaysLeft(next.daysLeft)}
        </span>
      ) : neverExpires ? (
        <span className={styles.expiryNote}>Does not expire</span>
      ) : null}
    </div>
  );
}
