import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { BranchRevenueComparisonChart } from '../../../reports/components/BranchRevenueComparisonChart/BranchRevenueComparisonChart';
import { CageAvailabilityWidget } from '../../../reports/components/CageAvailabilityWidget/CageAvailabilityWidget';
import { RecentTransactionsWidget } from '../../../reports/components/RecentTransactionsWidget/RecentTransactionsWidget';
import { GroomingQueueWidget } from '../../components/dashboard/GroomingQueueWidget/GroomingQueueWidget';
import { HotelQueueWidget } from '../../components/dashboard/HotelQueueWidget/HotelQueueWidget';
import { DaycareQueueWidget } from '../../components/dashboard/DaycareQueueWidget/DaycareQueueWidget';
import { VeterinaryConsultationQueueWidget } from '../../components/dashboard/VeterinaryConsultationQueueWidget/VeterinaryConsultationQueueWidget';
import { VeterinaryMyPatientsWidget } from '../../components/dashboard/VeterinaryMyPatientsWidget/VeterinaryMyPatientsWidget';
import { VeterinaryCatalogWidget } from '../../components/dashboard/VeterinaryCatalogWidget/VeterinaryCatalogWidget';
import { DaysOffWidget } from '../../components/dashboard/DaysOffWidget/DaysOffWidget';
import {
  ROLE_TO_DASHBOARD_SLUG,
  STAFF_DASHBOARD_CONFIG,
  type StaffDashboardSlug,
} from '../../config/staffDashboard.config';
import styles from './StaffDashboardPage.module.css';

function isDashboardSlug(
  value: string | undefined
): value is StaffDashboardSlug {
  return Boolean(value) && value! in STAFF_DASHBOARD_CONFIG;
}

/**
 * One dashboard page shared by every staff role, rather than a near-duplicate
 * page per role. `/staff/dashboard` (no param) and any mismatched `:roleSlug`
 * both resolve here and redirect to the viewer's own canonical slug, so a
 * staff member can never land on - or manually navigate to - another role's
 * dashboard. Content is a simple welcome message - the tile grid that used
 * to live here moved into the Sidebar (AppShell), so this landing page no
 * longer needs to duplicate that navigation. Superadmin additionally gets an
 * at-a-glance widget row (cage availability, recent transactions, branch
 * revenue comparison) - gated on the actual role, not the 'admin' slug,
 * since Admin shares that slug but not Superadmin's data access.
 */
export function StaffDashboardPage() {
  const { user, accessToken } = useAuth();
  const { roleSlug } = useParams<{ roleSlug?: string }>();

  const [canonicalSlug, setCanonicalSlug] = useState<StaffDashboardSlug | null>(
    null
  );
  const [role, setRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [branches, setBranches] = useState<BranchSummary[]>([]);

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
        setRole(result.data.role);
        setDisplayName(result.data.display_name);
        setStatus('ok');
      } else {
        setStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isSuperadmin = role === 'Superadmin';
  const isVeterinarian = role === 'Veterinarian';

  useEffect(() => {
    if (!isSuperadmin) return;

    let isMounted = true;

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [isSuperadmin]);

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
    return <Navigate to="/staff/settings" replace />;
  }

  if (!isDashboardSlug(roleSlug) || roleSlug !== canonicalSlug) {
    return <Navigate to={`/staff/dashboard/${canonicalSlug}`} replace />;
  }

  const config = STAFF_DASHBOARD_CONFIG[canonicalSlug];

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>
          Welcome back{displayName ? `, ${displayName}` : ''}!
        </h1>
        <p className={styles.copy}>
          {config.heading} - find your tools in the sidebar.
        </p>
      </div>

      {isSuperadmin ? (
        <div className={styles.widgetsSection}>
          <div className={styles.widgetsRow}>
            <CageAvailabilityWidget
              branches={branches}
              accessToken={accessToken}
            />
            <RecentTransactionsWidget
              branches={branches}
              accessToken={accessToken}
            />
            <BranchRevenueComparisonChart
              branches={branches}
              timeFilter="today"
              accessToken={accessToken}
            />
          </div>

          <div className={styles.widgetsRow}>
            <GroomingQueueWidget accessToken={accessToken} />
            <HotelQueueWidget accessToken={accessToken} />
            <DaycareQueueWidget accessToken={accessToken} />
            <VeterinaryConsultationQueueWidget accessToken={accessToken} />
          </div>
        </div>
      ) : isVeterinarian ? (
        <div className={styles.widgetsSection}>
          <div className={styles.widgetsGrid}>
            <VeterinaryConsultationQueueWidget accessToken={accessToken} />
            <VeterinaryMyPatientsWidget accessToken={accessToken} />
            <VeterinaryCatalogWidget accessToken={accessToken} />
            <DaysOffWidget staffId={user.id} accessToken={accessToken} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
