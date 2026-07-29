import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createMedicationCatalogItem,
  deleteMedicationCatalogItem,
  listMedicationCatalog,
  updateMedicationCatalogItem,
} from '../../api/hotel.api';
import { CatalogAdminPage } from '../../components/CatalogAdminPage/CatalogAdminPage';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

/** Issue #79 revision: Admin/Superadmin CRUD for the medication catalog
 * backing the check-in form's medication_name picker. */
export function HotelMedicationCatalogPage() {
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

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  if (isRoleLoading) {
    return <p>Loading...</p>;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <CatalogAdminPage
      title="Medication Catalog"
      itemNoun="medication"
      accessToken={accessToken}
      listItems={listMedicationCatalog}
      createItem={createMedicationCatalogItem}
      updateItem={updateMedicationCatalogItem}
      deleteItem={deleteMedicationCatalogItem}
    />
  );
}
