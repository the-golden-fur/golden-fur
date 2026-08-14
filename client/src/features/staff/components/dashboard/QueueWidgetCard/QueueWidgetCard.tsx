import { Link } from 'react-router';
import styles from './QueueWidgetCard.module.css';

interface QueueWidgetCardProps {
  title: string;
  to: string;
  isLoading: boolean;
  error: string | null;
  count: number;
  countLabel: string;
  emptyLabel: string;
  latestLabel: string | null;
}

/**
 * Shared shell for the Superadmin dashboard's four queue widgets (Grooming,
 * Hotel, Daycare, Veterinary Consultation) - each fetches its own queue
 * differently (different endpoint, filter, item shape), but renders the
 * same card: a count, the latest/next item, and a click-through to that
 * queue's full page. Mirrors DashboardTile's whole-card-is-a-link pattern.
 */
export function QueueWidgetCard({
  title,
  to,
  isLoading,
  error,
  count,
  countLabel,
  emptyLabel,
  latestLabel,
}: QueueWidgetCardProps) {
  return (
    <Link to={to} className={styles.card}>
      <h2 className={styles.title}>{title}</h2>

      {isLoading ? (
        <p className={styles.copy}>Loading...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : count === 0 ? (
        <p className={styles.copy}>{emptyLabel}</p>
      ) : (
        <div className={styles.summary}>
          <p className={styles.count}>
            {count} {countLabel}
          </p>
          {latestLabel ? (
            <p className={styles.latest}>{latestLabel}</p>
          ) : null}
        </div>
      )}
    </Link>
  );
}
