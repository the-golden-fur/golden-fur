import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createPackage,
  listBranches,
  listPackages,
  listServices,
  updatePackage,
} from '../../api/maintenance.api';
import {
  ServiceMultiSelect,
  type ServiceMultiSelectOption,
} from '../../components/ServiceMultiSelect/ServiceMultiSelect';
import { StatusBadge } from '../../components/shared/StatusBadge/StatusBadge';
import type {
  BranchSummary,
  Package,
  Service,
} from '../../maintenance.types';
import styles from './AdminPackageBuilderPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

export function AdminPackageBuilderPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [packages, setPackages] = useState<Package[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState('All');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(
    null
  );
  const [formBranchId, setFormBranchId] = useState('');
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Viewer role via the requester's own row in GET /staff, same as the other
  // admin pages.
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
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void Promise.all([
      listPackages(accessToken, { includeInactive: true }),
      // Active services only - a package must not bundle a deactivated
      // service at creation time (#41 dev notes).
      listServices(accessToken),
      listBranches(),
    ]).then(([packagesResult, servicesResult, branchesResult]) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (packagesResult.error || !packagesResult.data) {
        setLoadError(packagesResult.error ?? 'Could not load packages.');
        return;
      }

      setPackages(packagesResult.data);
      setServices(servicesResult.data ?? []);
      setBranches(branchesResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  const filteredPackages = useMemo(() => {
    if (branchFilter === 'All') {
      return packages;
    }

    return packages.filter((pkg) => pkg.branch_id === branchFilter);
  }, [packages, branchFilter]);

  // Only services offered (available) at the form's selected branch are
  // pickable - the service list stays hidden until a branch is chosen.
  const serviceOptions: ServiceMultiSelectOption[] = useMemo(() => {
    if (formBranchId === '') {
      return [];
    }

    return services
      .filter((service) =>
        (service.service_branch_availability ?? []).some(
          (row) => row.branch_id === formBranchId && row.is_available
        )
      )
      .map((service) => ({
        id: service.id,
        label: service.name,
        sublabel: `${service.category} - PHP ${service.base_price.toFixed(2)}`,
      }));
  }, [services, formBranchId]);

  const replacePackage = (updated: Package) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.id === updated.id ? updated : pkg))
    );
  };

  const openCreateForm = () => {
    setEditingPackageId(null);
    setFormBranchId('');
    setFormName('');
    setFormPrice('');
    setSelectedServiceIds([]);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (pkg: Package) => {
    setEditingPackageId(pkg.id);
    setFormBranchId(pkg.branch_id);
    setFormName(pkg.name);
    setFormPrice(String(pkg.bundled_price));
    setSelectedServiceIds(
      (pkg.package_services ?? []).map((link) => link.service_id)
    );
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPackageId(null);
    setFormError(null);
  };

  const handleActiveToggle = async (pkg: Package) => {
    if (!accessToken) {
      return;
    }

    const result = await updatePackage(pkg.id, accessToken, {
      is_active: !pkg.is_active,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the package.');
      return;
    }

    replacePackage(result.data);
    setMessage(
      result.data.is_active ? 'Package reactivated.' : 'Package deactivated.'
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const bundledPrice = Number(formPrice);

    if (formName.trim() === '' || formPrice === '' || bundledPrice <= 0) {
      setFormError('A name and a positive bundled price are required.');
      return;
    }

    if (selectedServiceIds.length < 2) {
      setFormError('A package bundles two or more services.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    if (editingPackageId === null) {
      if (formBranchId === '') {
        setIsSubmitting(false);
        setFormError('Select a branch first.');
        return;
      }

      const result = await createPackage(accessToken, {
        branch_id: formBranchId,
        name: formName.trim(),
        bundled_price: bundledPrice,
        service_ids: selectedServiceIds,
      });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not create the package.');
        return;
      }

      setPackages((prev) => [...prev, result.data as Package]);
      setMessage('Package created.');
      closeForm();
      return;
    }

    const result = await updatePackage(editingPackageId, accessToken, {
      name: formName.trim(),
      bundled_price: bundledPrice,
      service_ids: selectedServiceIds,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not update the package.');
      return;
    }

    replacePackage(result.data);
    setMessage('Package updated.');
    closeForm();
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the package builder.
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
        <p className={styles.copy}>Loading packages...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Packages</h1>

      <div className={styles.toolbar}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Branch</span>
          <select
            className={styles.filterSelect}
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
          >
            <option value="All">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={openCreateForm}
        >
          New package
        </button>
      </div>

      {message ? (
        <p className={styles.successBanner} role="status">
          {message}
        </p>
      ) : null}

      {isFormOpen ? (
        <section className={styles.formPanel} aria-labelledby="package-form">
          <h2 className={styles.sectionTitle} id="package-form">
            {editingPackageId === null ? 'Build package' : 'Edit package'}
          </h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Branch</span>
              <select
                className={styles.input}
                value={formBranchId}
                onChange={(event) => {
                  setFormBranchId(event.target.value);
                  // A different branch offers a different service list, so a
                  // stale selection can't carry across.
                  setSelectedServiceIds([]);
                }}
                // A package is one branch's row forever (MA22) - creating
                // "the same" package at the other branch is a second row.
                disabled={editingPackageId !== null}
                required
              >
                <option value="">Select a branch...</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Package name</span>
              <input
                className={styles.input}
                type="text"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Bundled price (PHP) - may differ from the sum of the included
                services
              </span>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={formPrice}
                onChange={(event) => setFormPrice(event.target.value)}
                required
              />
            </label>

            {formBranchId === '' ? (
              <p className={styles.copy}>
                Select a branch to pick its available services.
              </p>
            ) : (
              <ServiceMultiSelect
                label="Included services (pick two or more)"
                options={serviceOptions}
                selectedIds={selectedServiceIds}
                onChange={setSelectedServiceIds}
              />
            )}

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save package'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {filteredPackages.length === 0 ? (
        <p className={styles.copy}>No packages match the selected filter.</p>
      ) : (
        <ul className={styles.packageList}>
          {filteredPackages.map((pkg) => (
            <li key={pkg.id} className={styles.packageRow}>
              <div className={styles.packageMain}>
                <span className={styles.packageName}>{pkg.name}</span>
                <span className={styles.branchBadge}>
                  {branchNameById.get(pkg.branch_id) ??
                    `Branch ${pkg.branch_id.slice(0, 8)}`}
                </span>
                <span className={styles.packageMeta}>
                  {(pkg.package_services ?? []).length} services
                </span>
                <span className={styles.packageMeta}>
                  PHP {pkg.bundled_price.toFixed(2)}
                </span>
                <StatusBadge isActive={pkg.is_active} />
              </div>

              <div className={styles.packageControls}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => openEditForm(pkg)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleActiveToggle(pkg)}
                >
                  {pkg.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
