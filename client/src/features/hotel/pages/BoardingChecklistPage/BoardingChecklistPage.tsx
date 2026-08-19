import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { BoardingChecklistKanban } from '../../components/BoardingChecklistKanban/BoardingChecklistKanban';
import styles from './BoardingChecklistPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Pet Assistant',
  'Groomer',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

/** Custom change: renamed from Hotel Care Log - covers Hotel AND Daycare
 * (both share the same `stays`/`care_log_entries` tables) via the Kanban
 * board's own Hotel/Daycare subtabs. Boarding Checklist Kanban redesign:
 * every allowed role now sees the same Kanban board (Pending/In Progress/
 * Completed/Missed columns, filters, actionable checkboxes) - the old
 * Admin/Supervisor/Superadmin-only end-of-day flag panel is retired, since
 * the unified board's own Pending/Missed columns already surface the same
 * "what's still outstanding" view, just with real actions attached. */
export function BoardingChecklistPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the Boarding Checklist.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Boarding Checklist</h1>
        <BoardingChecklistKanban accessToken={accessToken} />
      </div>
    </main>
  );
}
