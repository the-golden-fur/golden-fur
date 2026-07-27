import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { CareLogChecklist } from '../../components/CareLogChecklist/CareLogChecklist';
import { UncompletedCareFlagPanel } from '../../components/UncompletedCareFlagPanel/UncompletedCareFlagPanel';
import styles from './HotelCareLogPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Pet Assistant',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

/**
 * Issue #80 route host: the Guide's Directory Structure lists
 * CareLogChecklist.tsx and UncompletedCareFlagPanel.tsx as components with
 * no page file of their own - both need a routed home to be reachable, so
 * this page fills that gap (see this issue's verification doc). Pet
 * Assistant sees the daily checklist; Admin/Supervisor/Superadmin see the
 * end-of-day flag panel - the two audiences never need both views at once.
 */
export function HotelCareLogPage() {
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
          Unable to load the Care Log.
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
    return <Navigate to="/staff/profile" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
      <h1 className={styles.title}>Hotel Care Log</h1>
      {role === 'Pet Assistant' ? (
        <CareLogChecklist accessToken={accessToken} />
      ) : (
        <UncompletedCareFlagPanel accessToken={accessToken} />
      )}
      </div>
    </main>
  );
}
