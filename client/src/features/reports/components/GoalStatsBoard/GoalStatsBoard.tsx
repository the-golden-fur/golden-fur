import { useEffect, useMemo, useState } from 'react';
import { listBookings } from '../../../booking/api/booking.api';
import type { Booking, ServiceCategory } from '../../../booking/booking.types';
import { getTransactionHistory } from '../../api/reports.api';
import type { TransactionRecord } from '../../reports.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import styles from './GoalStatsBoard.module.css';

/** Goal for a metric = last month's actual + this much. A single knob -
 * there's no goals table, this is a growth target, not a configured plan. */
const GOAL_GROWTH_RATE = 0.1;

/** Table 2 breaks these four out by name; "Assessment" bookings still count
 * toward the Table 1 total but aren't a customer-facing service line. */
const TRACKED_SERVICES: { category: ServiceCategory; label: string }[] = [
  { category: 'Grooming', label: 'Grooming' },
  { category: 'Veterinary', label: 'Veterinary' },
  { category: 'Daycare', label: 'Daycare' },
  { category: 'Hotel', label: 'Pet Hotel' },
];

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

function countGoal(previous: number): number {
  return Math.round(previous * (1 + GOAL_GROWTH_RATE));
}

function revenueGoal(previous: number): number {
  return Math.round(previous * (1 + GOAL_GROWTH_RATE) * 100) / 100;
}

interface GoalRow {
  label: string;
  thisMonth: number;
  lastMonth: number;
  goal: number;
}

interface GoalStatsBoardProps {
  accessToken: string;
}

/**
 * Superadmin dashboard header (above the widget grid): three "goal" tables -
 * total appointments booked, appointments per service, and revenue - each
 * showing this calendar month so far, all of last month, and a +10% goal off
 * last month. Appointments are counted by when the booking was created
 * (`created_at`), revenue by the transaction date; both aggregate every
 * branch. Reads the same list endpoints the other dashboard widgets use, so
 * no new server surface.
 */
export function GoalStatsBoard({ accessToken }: GoalStatsBoardProps) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    void Promise.all([
      listBookings(accessToken, {}),
      getTransactionHistory(
        { dateFrom: ymd(lastMonthStart), dateTo: ymd(now) },
        accessToken
      ),
    ]).then(([bookingsResult, transactionsResult]) => {
      if (!isMounted) return;

      if (bookingsResult.error || transactionsResult.error) {
        setError(
          bookingsResult.error ??
            transactionsResult.error ??
            'Could not load goal statistics.'
        );
        return;
      }

      setBookings(bookingsResult.data ?? []);
      setTransactions(transactionsResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const model = useMemo(() => {
    if (!bookings || !transactions) return null;

    const now = new Date();
    const thisMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime();
    const lastMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    ).getTime();

    const bucketOf = (iso: string): 'this' | 'last' | null => {
      const ms = new Date(iso).getTime();
      if (ms >= thisMonthStart) return 'this';
      if (ms >= lastMonthStart) return 'last';
      return null;
    };

    let apptThis = 0;
    let apptLast = 0;
    const serviceThis = new Map<string, number>();
    const serviceLast = new Map<string, number>();

    for (const booking of bookings) {
      const bucket = bucketOf(booking.created_at);
      if (!bucket) continue;

      if (bucket === 'this') apptThis += 1;
      else apptLast += 1;

      const map = bucket === 'this' ? serviceThis : serviceLast;
      map.set(
        booking.service_category,
        (map.get(booking.service_category) ?? 0) + 1
      );
    }

    let revenueThis = 0;
    let revenueLast = 0;
    for (const transaction of transactions) {
      const bucket = bucketOf(transaction.created_at);
      if (bucket === 'this') revenueThis += transaction.total_amount;
      else if (bucket === 'last') revenueLast += transaction.total_amount;
    }

    const appointments: GoalRow = {
      label: 'All appointments',
      thisMonth: apptThis,
      lastMonth: apptLast,
      goal: countGoal(apptLast),
    };

    const services: GoalRow[] = TRACKED_SERVICES.map(({ category, label }) => {
      const last = serviceLast.get(category) ?? 0;
      return {
        label,
        thisMonth: serviceThis.get(category) ?? 0,
        lastMonth: last,
        goal: countGoal(last),
      };
    });

    const revenue: GoalRow = {
      label: 'Revenue',
      thisMonth: revenueThis,
      lastMonth: revenueLast,
      goal: revenueGoal(revenueLast),
    };

    return { appointments, services, revenue };
  }, [bookings, transactions]);

  if (error) {
    return (
      <section className={styles.board}>
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!model) {
    return (
      <section className={styles.board}>
        <p className={styles.copy}>Loading goal statistics...</p>
      </section>
    );
  }

  return (
    <section className={styles.board} aria-label="Monthly goal statistics">
      <GoalTable
        title="Appointments booked"
        rows={[model.appointments]}
        firstColHeader="Metric"
      />
      <GoalTable
        title="By service"
        rows={model.services}
        firstColHeader="Service"
      />
      <GoalTable
        title="Revenue"
        rows={[model.revenue]}
        firstColHeader="Metric"
        format={formatCurrency}
      />
    </section>
  );
}

interface GoalTableProps {
  title: string;
  rows: GoalRow[];
  firstColHeader: string;
  format?: (value: number) => string;
}

function GoalTable({
  title,
  rows,
  firstColHeader,
  format = (value) => value.toLocaleString(),
}: GoalTableProps) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>{title}</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{firstColHeader}</th>
            <th scope="col">This month</th>
            <th scope="col">Last month</th>
            <th scope="col">Goal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const met = row.goal > 0 && row.thisMonth >= row.goal;
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td
                  className={styles.value}
                  data-met={met ? 'true' : undefined}
                >
                  {format(row.thisMonth)}
                </td>
                <td className={styles.value}>{format(row.lastMonth)}</td>
                <td className={styles.goal}>{format(row.goal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
