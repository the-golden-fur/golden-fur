import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { MiscSaleWizard } from '../../components/MiscSaleWizard/MiscSaleWizard';
import { MISC_SALES_PATH, MISC_SALE_VIEWER_ROLES } from '../../miscSaleAccess';
import styles from './NewMiscSalePage.module.css';

/**
 * "New Misc Sale" as its own full page (was a modal on
 * MiscSaleManagementPage) - the five-step wizard needs the room, and a real
 * route means a refresh or the browser Back button behaves as expected.
 * The list page refetches on mount, so a recorded sale shows up there on
 * return without any hand-off.
 */
export function NewMiscSalePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  // Bumped by "Record another sale" to remount the wizard fresh.
  const [wizardKey, setWizardKey] = useState(0);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (
    viewerRole === null ||
    !MISC_SALE_VIEWER_ROLES.has(viewerRole) ||
    !accessToken
  ) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <Link className={styles.backLink} to={MISC_SALES_PATH}>
            &larr; Back to Miscellaneous Sales
          </Link>
          <h1 className={styles.title}>New Miscellaneous Sale</h1>
          <p className={styles.copy}>
            Pick the customer, add the products, then take payment.
          </p>
        </header>

        <MiscSaleWizard
          key={wizardKey}
          accessToken={accessToken}
          onClose={() => navigate(MISC_SALES_PATH)}
          closeLabel="Back to Miscellaneous Sales"
          onStartOver={() => setWizardKey((key) => key + 1)}
        />
      </div>
    </main>
  );
}
