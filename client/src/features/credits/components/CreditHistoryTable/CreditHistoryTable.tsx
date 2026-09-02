import type { CreditTransaction } from '../../credits.types';
import styles from './CreditHistoryTable.module.css';

function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₱${Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    // Pinned to the business timezone so the shown day matches the expiry
    // day math in credits/utils/expiry.ts.
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const TYPE_LABELS: Record<CreditTransaction['transaction_type'], string> = {
  issuance: 'Issued',
  redemption: 'Redeemed',
  expiry: 'Expired',
};

interface CreditHistoryTableProps {
  history: CreditTransaction[];
}

/** Issue #95: issuance/redemption/expiry history for one (customer, branch)
 * pair - amount is signed at the source (positive issuance, negative
 * redemption/expiry), so no extra sign logic is needed beyond styling. */
export function CreditHistoryTable({ history }: CreditHistoryTableProps) {
  if (history.length === 0) {
    return (
      <p className={styles.empty}>No credit history for this branch yet.</p>
    );
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Type</th>
            <th scope="col">Amount</th>
            <th scope="col">Expires</th>
          </tr>
        </thead>
        <tbody>
          {history.map((txn) => (
            <tr key={txn.id}>
              <td>{formatDate(txn.created_at)}</td>
              <td>{TYPE_LABELS[txn.transaction_type]}</td>
              <td
                className={txn.amount >= 0 ? styles.positive : styles.negative}
              >
                {formatCurrency(txn.amount)}
              </td>
              <td>{formatDate(txn.expires_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
