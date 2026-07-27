import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../api/staff.api';
import {
  ROLE_TO_DASHBOARD_SLUG,
  STAFF_DASHBOARD_CONFIG,
  type StaffDashboardSlug,
} from '../../config/staffDashboard.config';
import { DashboardTile } from '../../components/dashboard/DashboardTile/DashboardTile';
import styles from './StaffDashboardPage.module.css';

function isDashboardSlug(
  value: string | undefined
): value is StaffDashboardSlug {
  return Boolean(value) && value! in STAFF_DASHBOARD_CONFIG;
}

/**
 * One dashboard page shared by every staff role, rather than a near-duplicate
 * page per role - the tile set (staffDashboard.config.ts) is what actually
 * differs. `/staff/dashboard` (no param) and any mismatched `:roleSlug` both
 * resolve here and redirect to the viewer's own canonical slug, so a staff
 * member can never land on - or manually navigate to - another role's
 * dashboard shape.
 */
export function StaffDashboardPage() {
  const { user, accessToken } = useAuth();
  const { roleSlug } = useParams<{ roleSlug?: string }>();

  const [canonicalSlug, setCanonicalSlug] = useState<StaffDashboardSlug | null>(
    null
  );
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      if (result.data) {
        setCanonicalSlug(ROLE_TO_DASHBOARD_SLUG[result.data.role]);
        setStatus('ok');
      } else {
        setStatus('denied');
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
            Unable to load your dashboard.
          </p>
        </div>
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  if (status === 'denied' || !canonicalSlug) {
    return <Navigate to="/staff/profile" replace />;
  }

  if (!isDashboardSlug(roleSlug) || roleSlug !== canonicalSlug) {
    return <Navigate to={`/staff/dashboard/${canonicalSlug}`} replace />;
  }

  const config = STAFF_DASHBOARD_CONFIG[canonicalSlug];

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>{config.heading}</h1>
        <div className={styles.grid}>
          {config.tiles.map((tile) => (
            <DashboardTile key={tile.title} {...tile} />
          ))}
        </div>
      </div>
    </main>
  );
}
