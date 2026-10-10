import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listStaff } from '../../../staff/api/staff.api';
import { VetServiceCatalogTab } from '../VetCatalogPage/VetServiceCatalogTab';
import styles from './VetServicesConfigurationPage.module.css';

/** Superadmin-only: the vet procedure list is one list for every branch's
 * vets, so a branch-scoped Admin has no access - matched by the server's
 * /veterinary/service-catalog routes (VETERINARY_SERVICE_CATALOG_ROLES). */
const ALLOWED_VIEWER_ROLES = new Set(['Superadmin']);

/**
 * Custom change (Config > Veterinary Services): the clinic's vet procedure
 * list - the services and usual prices a vet picks from when completing a
 * visit (vet_service_catalog). The same list Veterinarians see under My
 * Catalog > Services, so it reuses that tab for the add/edit/delete UI.
 *
 * The services customers book (Consultation, Follow-up Consultation,
 * Vaccination) are separate and stay under Services and Packages.
 */
export function VetServicesConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

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
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <LoadingState />
        </div>
      </main>
    );
  }

  if (!viewerRole || !ALLOWED_VIEWER_ROLES.has(viewerRole) || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Veterinary Services</h1>
        <p className={styles.copy}>
          The services and usual prices vets choose from when they list what was
          done at a visit. The price fills in for the vet and can still be
          changed per visit. Changes save straight away.
        </p>

        <VetServiceCatalogTab accessToken={accessToken} description={null} />
      </div>
    </main>
  );
}
