import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getGoals } from '../../api/reports.api';
import type { GoalsReport } from '../../reports.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { currentGoalMonth } from '../../utils/goalMonth';
import { GoalTable } from '../GoalTable/GoalTable';
import styles from './GoalStatsBoard.module.css';

interface GoalStatsBoardProps {
  accessToken: string;
}

/**
 * Superadmin dashboard header (above the widget grid): three "goal" tables -
 * total appointments booked, appointments per service, and revenue - each
 * showing this calendar month so far, all of last month, and the goal, across
 * every branch. The figures and goals are the same ones the Goals page shows
 * and configures (GET /reports/goals), so the two never disagree; this is
 * just the at-a-glance cut of it.
 */
export function GoalStatsBoard({ accessToken }: GoalStatsBoardProps) {
  const [goals, setGoals] = useState<GoalsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void getGoals(currentGoalMonth(), null, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not load goal statistics.');
        return;
      }

      setGoals(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  if (error) {
    return (
      <section className={styles.board}>
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!goals) {
    return (
      <section className={styles.board}>
        <LoadingState label="Loading goal statistics..." />
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Monthly goal statistics">
      <div className={styles.board}>
        <GoalTable
          title="Appointments booked"
          rows={[goals.appointments]}
          firstColHeader="Metric"
        />
        <GoalTable
          title="By service"
          rows={goals.services}
          firstColHeader="Service"
        />
        <GoalTable
          title="Revenue"
          rows={[goals.revenue]}
          firstColHeader="Metric"
          format={formatCurrency}
        />
      </div>
      <Link className={styles.allGoalsLink} to="/staff/reports/goals">
        View all goals
      </Link>
    </section>
  );
}
