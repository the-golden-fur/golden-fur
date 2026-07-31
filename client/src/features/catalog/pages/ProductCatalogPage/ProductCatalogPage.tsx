import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from '../../api/catalog.api';
import { CatalogAdminPage } from '../../components/CatalogAdminPage/CatalogAdminPage';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

/**
 * Sprint 5 unification (#82): replaces HotelFoodCatalogPage +
 * HotelMedicationCatalogPage - one Admin/Superadmin CRUD surface for the
 * shared product_catalog table (hotel food, hotel medication, and any
 * future retail product), instead of two near-duplicate pages.
 */
export function ProductCatalogPage() {
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
      title="Product Catalog"
      itemNoun="product"
      accessToken={accessToken}
      listItems={(token) => listProducts(token)}
      createItem={createProduct}
      updateItem={updateProduct}
      deleteItem={deleteProduct}
    />
  );
}
