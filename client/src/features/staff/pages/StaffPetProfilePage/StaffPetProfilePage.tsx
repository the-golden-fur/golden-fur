import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPet } from '../../../customers/api/customer.api';
import { PetDetailPanel } from '../../../customers/components/panels/PetDetailPanel/PetDetailPanel';
import type { Pet } from '../../../customers/customer.types';
import { listStaff } from '../../api/staff.api';
import styles from './StaffPetProfilePage.module.css';

/**
 * Same role list as CUSTOMER_MANAGER_ROLES (server) / CustomerManagementPage
 * (client) - the only roles that can reach this page via "View Pets" are
 * already the ones authorized to edit a pet on a customer's behalf
 * (pet.controller.ts's isAuthorizedStaff), so canEdit is unconditionally
 * true here - the page-level gate below is what actually enforces it.
 */
const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

/**
 * Staff-side counterpart to the customer portal's PetProfilePage
 * (`/portal/pets/:petId`) - that route is gated by CustomerAuthGuard, which
 * redirects away any session without a matching customer_profiles row, so a
 * staff member clicking a pet card from Customer Management's "View Pets"
 * menu (Issue #76) would otherwise never reach it. This route reuses the
 * same PetDetailPanel under StaffAuthGuard instead.
 */
export function StaffPetProfilePage() {
  const { petId } = useParams<{ petId: string }>();
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [pet, setPet] = useState<Pet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!petId || !accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void getPet(petId, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load this pet.');
        return;
      }

      setPet(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken, isAllowedViewer]);

  if (!petId || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load this pet.
        </p>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/profile" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading pet...</p>
      </main>
    );
  }

  if (loadError || !pet) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError ?? 'Pet not found.'}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{pet.name}</h1>

      <PetDetailPanel
        pet={pet}
        accessToken={accessToken}
        canEdit
        onUpdated={setPet}
      />
    </main>
  );
}
