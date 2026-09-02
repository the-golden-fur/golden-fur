import { useCallback, useEffect, useRef, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { useCreditBalance } from '../../providers/useCreditBalance';
import type { CreditBalance } from '../../credits.types';
import {
  daysUntil,
  describeDaysLeft,
  formatExpiryDate,
} from '../../utils/expiry';
import styles from './CreditBalanceIndicator.module.css';

/** ms to keep the popover open after the pointer leaves, so a diagonal move
 * from pill to panel doesn't dismiss it. */
const CLOSE_DELAY_MS = 120;

function expiryLine(balance: CreditBalance, now: number): string {
  if (!balance.next_expires_at) return 'No expiry';
  const amount = formatCurrency(balance.next_expires_amount ?? 0);
  return `${amount} expires ${formatExpiryDate(balance.next_expires_at)} · ${describeDaysLeft(
    daysUntil(balance.next_expires_at, now)
  )}`;
}

/**
 * Navbar pill showing the signed-in customer's total account credit across
 * all branches. Clicking it opens the dedicated credits page; hovering (or
 * focusing) it reveals a per-branch breakdown with each branch's soonest
 * expiry. Always rendered, even at a zero balance, so customers discover the
 * feature. Customer-only - CustomerAuthGuard passes it as the Navbar's
 * creditIndicator prop; staff never get one.
 */
export function CreditBalanceIndicator() {
  const { total, balances } = useCreditBalance();
  const funded = balances.filter((balance) => balance.balance > 0);

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openPopover = useCallback(() => {
    cancelClose();
    setNow(Date.now());
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  // Branch names for the popover - fetched once, only after it's first
  // needed. listBranches() is an unauthenticated read.
  useEffect(() => {
    if (!open || branches.length > 0 || funded.length === 0) return;
    let active = true;
    void listBranches().then((result) => {
      if (active && result.data) setBranches(result.data);
    });
    return () => {
      active = false;
    };
  }, [open, branches.length, funded.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Branch credit';

  return (
    <div
      className={styles.wrapper}
      ref={wrapperRef}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
      onFocus={openPopover}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node)) {
          scheduleClose();
        }
      }}
    >
      <Link
        to="/portal/credits"
        className={styles.indicator}
        aria-label={`Account credit: ${formatCurrency(total)}`}
      >
        <Wallet size={18} aria-hidden="true" />
        <span className={styles.amount}>{formatCurrency(total)}</span>
      </Link>

      {open && funded.length > 0 ? (
        <div className={styles.popover} role="tooltip">
          <span className={styles.popoverTitle}>Account credit by branch</span>
          <ul className={styles.branchList}>
            {funded.map((balance) => (
              <li key={balance.id} className={styles.branchRow}>
                <span className={styles.branchHead}>
                  <span className={styles.branchName}>
                    {branchName(balance.branch_id)}
                  </span>
                  <span className={styles.branchBalance}>
                    {formatCurrency(balance.balance)}
                  </span>
                </span>
                <span className={styles.branchExpiry}>
                  {expiryLine(balance, now)}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/portal/credits" className={styles.popoverLink}>
            View credit details →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
