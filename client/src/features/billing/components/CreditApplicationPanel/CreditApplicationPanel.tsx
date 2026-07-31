import styles from './CreditApplicationPanel.module.css';

interface CreditApplicationPanelProps {
  /** TODO(Epic B, #90): Epic B (credit_balances) hasn't shipped, so there is
   * no GET /credits/balance endpoint yet to fetch this from - callers pass
   * 0 until then (matching server/src/features/billing/services/
   * creditStub.service.ts's own stub). The control below still enforces the
   * MIN(available, transactionTotal) guard against whatever value it's
   * given, so it needs no further change once a real balance is wired in. */
  availableBalance: number;
  transactionTotal: number;
  creditToApply: number;
  onChange: (amount: number) => void;
}

/**
 * Issue #86 AC-2: shows the available balance up front and prevents
 * entering an amount above MIN(available_balance, transaction_total)
 * client-side - a UX safeguard, not a substitute for the server-side guard
 * in checkoutAggregation.service.ts / miscSale.service.ts.
 */
export function CreditApplicationPanel({
  availableBalance,
  transactionTotal,
  creditToApply,
  onChange,
}: CreditApplicationPanelProps) {
  const maxApplicable = Math.max(
    0,
    Math.min(availableBalance, transactionTotal)
  );

  if (availableBalance <= 0) {
    return (
      <section className={styles.panel} aria-labelledby="credit-title">
        <h2 className={styles.title} id="credit-title">
          Customer credit
        </h2>
        <p className={styles.copy}>No available credit for this customer.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="credit-title">
      <h2 className={styles.title} id="credit-title">
        Customer credit
      </h2>
      <p className={styles.copy}>
        Available balance: PHP {availableBalance.toFixed(2)}
      </p>
      <label className={styles.field}>
        <span className={styles.label}>Amount to apply (PHP)</span>
        <input
          className={styles.input}
          type="number"
          min="0"
          max={maxApplicable}
          step="0.01"
          value={creditToApply}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(Math.max(0, Math.min(next, maxApplicable)));
          }}
        />
      </label>
    </section>
  );
}
