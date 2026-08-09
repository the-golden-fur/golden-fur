import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { BoardingChecklistKanban } from '../../components/BoardingChecklistKanban/BoardingChecklistKanban';
import { UncompletedCareFlagPanel } from '../../components/UncompletedCareFlagPanel/UncompletedCareFlagPanel';
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
 * board's own Hotel/Daycare subtabs, and is now also reachable by Groomer,
 * not just Pet Assistant. Groomer/Pet Assistant see the Kanban checklist;
 * Admin/Supervisor/Superadmin still see the end-of-day flag panel - the two
 * audiences never need both views at once (unchanged from the old page). */
export function BoardingChecklistPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setRole(result.data.role);
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
        {role === 'Pet Assistant' || role === 'Groomer' ? (
          <BoardingChecklistKanban accessToken={accessToken} />
        ) : (
          <UncompletedCareFlagPanel accessToken={accessToken} />
        )}
      </div>
    </main>
  );
}
