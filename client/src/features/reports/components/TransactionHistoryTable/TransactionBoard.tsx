import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { PaymentStatusBadge } from '../../../booking/components/shared/PaymentStatusBadge/PaymentStatusBadge';
import type { PaymentStatus } from '../../../booking/booking.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import type { TransactionRecord } from '../../reports.types';
import { paymentChoiceLabel, transactionTypeLabel } from './transactionDisplay';
import styles from './TransactionBoard.module.css';

interface TransactionBoardProps {
  /** Already client-filtered + sorted by the page. */
  transactions: TransactionRecord[];
  /** Corner actions per card - a MoreOptionsMenu (staff) or a Pay button
   * (customer). Rendered inside a wrapper that stops click propagation. */
  renderActions: (transaction: TransactionRecord) => ReactNode;
  /** When set, the card body becomes activatable (opens booking details on the
   * customer portal). */
  onCardActivate?: (transaction: TransactionRecord) => void;
  /** The customer portal shows the viewer their own transactions, so the name
   * on every card is noise there - hide it. Defaults to shown (staff). */
  showCustomer?: boolean;
}

const COLUMNS: Array<{ status: PaymentStatus; className: string }> = [
  { status: 'Pending', className: styles.columnPending },
  { status: 'Partially Paid', className: styles.columnPartial },
  { status: 'Fully Paid', className: styles.columnPaid },
];

/**
 * Board view of the transactions list - fixed columns by payment status, the
 * way a cashier actually works (clear the "Due payment" column). Grouping is
 * fixed for now; `groupBy` is left implicit as the extension point.
 */
export function TransactionBoard({
  transactions,
  renderActions,
  onCardActivate,
  showCustomer = true,
}: TransactionBoardProps) {
  return (
    <div
      className={styles.board}
      style={{ '--column-count': COLUMNS.length } as CSSProperties}
    >
      {COLUMNS.map((column) => {
        const cards = transactions.filter(
          (transaction) => transaction.payment_status === column.status
        );
        return (
          <section
            key={column.status}
            className={`${styles.column} ${column.className}`}
          >
            <h3 className={styles.columnTitle}>
              <PaymentStatusBadge status={column.status} context="billing" />
              <span className={styles.columnCount}>{cards.length}</span>
            </h3>

            {cards.length === 0 ? (
              <p className={styles.empty}>Nothing here.</p>
            ) : (
              cards.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  showCustomer={showCustomer}
                  actions={renderActions(transaction)}
                  onActivate={
                    // Only make the card a button when activating it will
                    // actually do something - a misc sale has no booking to
                    // open, so it must not read as a focusable control.
                    onCardActivate && transaction.booking_id
                      ? () => onCardActivate(transaction)
                      : undefined
                  }
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

interface TransactionCardProps {
  transaction: TransactionRecord;
  showCustomer: boolean;
  actions: ReactNode;
  onActivate?: () => void;
}

function TransactionCard({
  transaction,
  showCustomer,
  actions,
  onActivate,
}: TransactionCardProps) {
  const method =
    transaction.payment_status === 'Pending'
      ? null
      : transaction.payment_method;
  const headline = showCustomer
    ? (transaction.customer_name ?? '—')
    : transactionTypeLabel(transaction);
  const service = transaction.bookings?.service_category ?? null;
  const detailText = showCustomer
    ? [transactionTypeLabel(transaction), service].filter(Boolean).join(' · ')
    : service;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onActivate) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <div className={styles.card}>
      <div
        className={onActivate ? styles.cardBodyClickable : styles.cardBody}
        role={onActivate ? 'button' : undefined}
        tabIndex={onActivate ? 0 : undefined}
        onClick={onActivate}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.cardHeadline}>
          <span className={styles.customer}>{headline}</span>
          <span className={styles.amount}>
            {formatCurrency(transaction.total_amount)}
          </span>
        </div>
        {detailText ? <p className={styles.detail}>{detailText}</p> : null}
        <p className={styles.meta}>
          {new Date(transaction.created_at).toLocaleDateString()} ·{' '}
          {paymentChoiceLabel(transaction)}
          {method ? ` · ${method}` : ''}
        </p>
      </div>

      {actions ? (
        <div
          className={styles.cardActions}
          onClick={(event) => event.stopPropagation()}
          role="presentation"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
