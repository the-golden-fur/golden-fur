import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  listBranches,
  listPackages,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import type {
  BranchSummary,
  Package,
  Service,
} from '../../../maintenance/maintenance.types';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { BranchAvailabilityModal } from '../../../maintenance/components/BranchAvailabilityModal/BranchAvailabilityModal';
import { BranchMultiSelect } from '../../../maintenance/components/BranchMultiSelect/BranchMultiSelect';
import {
  archiveDiscount,
  createDiscount,
  listDiscounts,
  setDiscountBranchAvailability,
  updateDiscount,
} from '../../api/discounts.api';
import {
  DiscountFilterBar,
  type DiscountScopeTypeFilter,
  type DiscountStatusFilter,
} from '../../components/DiscountFilterBar/DiscountFilterBar';
import { DiscountCategoryScopeSelect } from '../../components/DiscountCategoryScopeSelect/DiscountCategoryScopeSelect';
import type {
  Discount,
  DiscountScopeType,
  DiscountValueType,
} from '../../discounts.types';
import styles from './AdminDiscountManagementPage.module.css';

/** Same list as DISCOUNT_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DISCOUNT_TYPES: DiscountValueType[] = ['Percentage', 'Flat'];

function availableBranchIds(discount: Discount): string[] {
  return (discount.discount_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/** Custom change (unify active/available): mirrors the server's own sync
 * rule (discounts.service.ts) so the client's optimistic local update
 * matches what a refetch would show, without a round trip. */
function deriveIsActive(
  availability: Discount['discount_branch_availability']
) {
  return (availability ?? []).some((row) => row.is_available);
}

export function AdminDiscountManagementPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [scopeTypeFilter, setScopeTypeFilter] =
    useState<DiscountScopeTypeFilter>('All');
  const [statusFilter, setStatusFilter] = useState<DiscountStatusFilter>('All');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(
    null
  );
  const [editingIsMandated, setEditingIsMandated] = useState(false);
  const [formBranchIds, setFormBranchIds] = useState<string[]>([]);
  const [formName, setFormName] = useState('');
  const [formDiscountType, setFormDiscountType] =
    useState<DiscountValueType>('Percentage');
  const [formValue, setFormValue] = useState('');
  const [formScopeType, setFormScopeType] =
    useState<DiscountScopeType>('service');
  const [formScopeServiceId, setFormScopeServiceId] = useState('');
  const [formScopePackageId, setFormScopePackageId] = useState('');
  const [formScopeCategory, setFormScopeCategory] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [availabilityDiscountId, setAvailabilityDiscountId] = useState<
    string | null
  >(null);

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
      // No activeOnly - the management view must show mandated-but-off rows
      // so an Admin can toggle them on (discounts default to off project-wide).
      listDiscounts(accessToken),
      listServices(accessToken),
      listPackages(accessToken),
      listBranches(),
    ]).then(
      ([discountsResult, servicesResult, packagesResult, branchesResult]) => {
        if (!isMounted) {
          return;
        }

        setIsLoading(false);

        if (discountsResult.error || !discountsResult.data) {
          setLoadError(discountsResult.error ?? 'Could not load discounts.');
          return;
        }

        setDiscounts(discountsResult.data);
        setServices(servicesResult.data ?? []);
        setPackages(packagesResult.data ?? []);
        setBranches(branchesResult.data ?? []);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const serviceNameById = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services]
  );

  const packageNameById = useMemo(
    () => new Map(packages.map((pkg) => [pkg.id, pkg.name])),
    [packages]
  );

  const filteredDiscounts = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return discounts.filter((discount) => {
      if (
        branchFilter !== 'All' &&
        !availableBranchIds(discount).includes(branchFilter)
      ) {
        return false;
      }

      if (
        scopeTypeFilter !== 'All' &&
        discount.scope_type !== scopeTypeFilter
      ) {
        return false;
      }

      if (statusFilter === 'Active' && !discount.is_active) {
        return false;
      }

      if (statusFilter === 'Inactive' && discount.is_active) {
        return false;
      }

      if (searchTerm && !discount.name.toLowerCase().includes(searchTerm)) {
        return false;
      }

      return true;
    });
  }, [discounts, branchFilter, scopeTypeFilter, statusFilter, search]);

  const mandatedDiscounts = useMemo(
    () => filteredDiscounts.filter((discount) => discount.is_mandated),
    [filteredDiscounts]
  );

  const customDiscounts = useMemo(
    () => filteredDiscounts.filter((discount) => !discount.is_mandated),
    [filteredDiscounts]
  );

  // A package is offered to the form's scope picker if it's available at
  // ANY of the currently selected branches - a discount can span several
  // branches, and its package scope only needs to exist at one of them.
  const packageOptionsForBranches = useMemo(() => {
    if (formBranchIds.length === 0) {
      return [];
    }

    return packages.filter((pkg) =>
      (pkg.package_branch_availability ?? []).some(
        (row) => formBranchIds.includes(row.branch_id) && row.is_available
      )
    );
  }, [packages, formBranchIds]);

  const availabilityDiscount = discounts.find(
    (discount) => discount.id === availabilityDiscountId
  );

  const replaceDiscount = (updated: Discount) => {
    setDiscounts((prev) =>
      prev.map((discount) => (discount.id === updated.id ? updated : discount))
    );
  };

  const resetScopeFields = () => {
    setFormScopeServiceId('');
    setFormScopePackageId('');
    setFormScopeCategory('');
  };

  const openCreateForm = () => {
    setEditingDiscountId(null);
    setEditingIsMandated(false);
    setFormBranchIds([]);
    setFormName('');
    setFormDiscountType('Percentage');
    setFormValue('');
    setFormScopeType('service');
    resetScopeFields();
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (discount: Discount) => {
    setEditingDiscountId(discount.id);
    setEditingIsMandated(discount.is_mandated);
    setFormBranchIds(availableBranchIds(discount));
    setFormName(discount.name);
    setFormDiscountType(discount.discount_type);
    setFormValue(String(discount.value));
    setFormScopeType(discount.scope_type);
    setFormScopeServiceId(discount.scope_service_id ?? '');
    setFormScopePackageId(discount.scope_package_id ?? '');
    setFormScopeCategory(discount.scope_category ?? '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingDiscountId(null);
    setEditingIsMandated(false);
    setFormError(null);
  };

  const handleBranchToggle = async (
    discount: Discount,
    branchId: string,
    isAvailable: boolean
  ) => {
    if (!accessToken) {
      return;
    }

    const result = await setDiscountBranchAvailability(
      discount.id,
      accessToken,
      { branch_id: branchId, is_available: isAvailable }
    );

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update branch availability.');
      return;
    }

    const rows = discount.discount_branch_availability ?? [];
    const hasRow = rows.some((row) => row.branch_id === branchId);
    const nextRows = hasRow
      ? rows.map((row) =>
          row.branch_id === branchId ? { ...row, ...result.data } : row
        )
      : [...rows, result.data];

    replaceDiscount({
      ...discount,
      discount_branch_availability: nextRows,
      is_active: deriveIsActive(nextRows),
    });
  };

  const handleArchive = async (discount: Discount) => {
    if (!accessToken) {
      return;
    }

    const result = await archiveDiscount(discount.id, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setDiscounts((prev) => prev.filter((item) => item.id !== discount.id));
    setMessage('Discount archived.');
  };

  /**
   * Applies the edit form's branch multiselect to a just-updated discount by
   * diffing it against the row's current availability and only calling
   * setDiscountBranchAvailability for branches whose selection actually
   * changed - same approach as AdminServicesPage's applyBranchSelection.
   * Create doesn't need this: branch_ids goes straight into the create
   * payload and the server seeds the availability rows itself.
   */
  async function applyBranchSelection(
    discount: Discount,
    selectedBranchIds: string[]
  ): Promise<Discount> {
    if (!accessToken) {
      return discount;
    }

    const rows = discount.discount_branch_availability ?? [];
    const changedBranches = branches.filter((branch) => {
      const current =
        rows.find((row) => row.branch_id === branch.id)?.is_available ?? false;
      const next = selectedBranchIds.includes(branch.id);
      return current !== next;
    });

    if (changedBranches.length === 0) {
      return discount;
    }

    const results = await Promise.all(
      changedBranches.map((branch) =>
        setDiscountBranchAvailability(discount.id, accessToken, {
          branch_id: branch.id,
          is_available: selectedBranchIds.includes(branch.id),
        })
      )
    );

    const updatedRows = [...rows];

    changedBranches.forEach((branch, index) => {
      const data = results[index]?.data;
      if (!data) return;

      const rowIndex = updatedRows.findIndex(
        (row) => row.branch_id === branch.id
      );

      if (rowIndex >= 0) {
        updatedRows[rowIndex] = data;
      } else {
        updatedRows.push(data);
      }
    });

    return {
      ...discount,
      discount_branch_availability: updatedRows,
      is_active: deriveIsActive(updatedRows),
    };
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const value = Number(formValue);

    if (formName.trim() === '' || formValue === '' || value < 0) {
      setFormError('A name and a non-negative discount value are required.');
      return;
    }

    if (formDiscountType === 'Percentage' && value > 100) {
      setFormError('A percentage value cannot exceed 100.');
      return;
    }

    if (formBranchIds.length === 0) {
      setFormError('Select at least one branch.');
      return;
    }

    if (formScopeType === 'service' && formScopeServiceId === '') {
      setFormError('Select a service to scope this discount to.');
      return;
    }

    if (formScopeType === 'package' && formScopePackageId === '') {
      setFormError('Select a package to scope this discount to.');
      return;
    }

    if (formScopeType === 'category' && formScopeCategory === '') {
      setFormError('Select a category to scope this discount to.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const scopeFields =
      formScopeType === 'service'
        ? { scope_service_id: formScopeServiceId }
        : formScopeType === 'package'
          ? { scope_package_id: formScopePackageId }
          : {
              scope_category: formScopeCategory as NonNullable<
                Discount['scope_category']
              >,
            };

    if (editingDiscountId === null) {
      const result = await createDiscount(accessToken, {
        branch_ids: formBranchIds,
        name: formName.trim(),
        discount_type: formDiscountType,
        value,
        scope_type: formScopeType,
        ...scopeFields,
      });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not create the discount.');
        return;
      }

      setDiscounts((prev) => [...prev, result.data as Discount]);
      setMessage('Discount created.');
      closeForm();
      return;
    }

    // A mandated discount's name is immutable (#43 AC-3) - omit it entirely
    // rather than resubmit the unchanged value, since the field is read-only
    // in this form anyway.
    const result = await updateDiscount(editingDiscountId, accessToken, {
      ...(editingIsMandated ? {} : { name: formName.trim() }),
      discount_type: formDiscountType,
      value,
      scope_type: formScopeType,
      ...scopeFields,
    });

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setFormError(result.error ?? 'Could not update the discount.');
      return;
    }

    const finalDiscount = await applyBranchSelection(
      result.data,
      formBranchIds
    );

    setIsSubmitting(false);
    replaceDiscount(finalDiscount);
    setMessage('Discount updated.');
    closeForm();
  };

  const describeScope = (discount: Discount): string => {
    if (discount.scope_type === 'service') {
      return `Service: ${
        serviceNameById.get(discount.scope_service_id ?? '') ?? 'Unknown'
      }`;
    }

    if (discount.scope_type === 'package') {
      return `Package: ${
        packageNameById.get(discount.scope_package_id ?? '') ?? 'Unknown'
      }`;
    }

    return `Category: ${discount.scope_category ?? 'Unknown'}`;
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the discount management panel.
          </p>
        </div>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading discounts...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  const renderDiscountRow = (discount: Discount) => (
    <li key={discount.id} className={styles.discountRow}>
      <div className={styles.discountMain}>
        <span className={styles.discountName}>{discount.name}</span>
        <span className={styles.scopeBadge}>
          {discount.scope_type === 'service'
            ? 'Service'
            : discount.scope_type === 'package'
              ? 'Package'
              : 'Category'}
        </span>
        <span className={styles.discountMeta}>
          {discount.discount_type === 'Percentage'
            ? `${discount.value}%`
            : `PHP ${discount.value.toFixed(2)}`}
        </span>
        <span className={styles.discountMeta}>{describeScope(discount)}</span>
      </div>

      <div className={styles.discountControls}>
        <MoreOptionsMenu
          label={`Actions for ${discount.name}`}
          items={[
            { label: 'Configure', onSelect: () => openEditForm(discount) },
            {
              label: 'Branch Availability',
              onSelect: () => setAvailabilityDiscountId(discount.id),
            },
            ...(!discount.is_active && !discount.is_mandated
              ? [
                  {
                    label: 'Archive',
                    onSelect: () => void handleArchive(discount),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </li>
  );

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Discounts</h1>
          <Link
            className={styles.archiveLink}
            to="/staff/admin/archive?tab=discounts"
          >
            View archive
          </Link>
        </div>
        <p className={styles.copy}>
          A discount is active wherever it&apos;s available - use a row&apos;s
          &quot;...&quot; menu &gt; Branch Availability to turn it on or off per
          branch.
        </p>

        <div className={styles.toolbar}>
          <DiscountFilterBar
            branches={branches}
            branchFilter={branchFilter}
            onBranchFilterChange={setBranchFilter}
            search={search}
            onSearchChange={setSearch}
            scopeTypeFilter={scopeTypeFilter}
            onScopeTypeFilterChange={setScopeTypeFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          <button
            type="button"
            className={styles.primaryButton}
            onClick={openCreateForm}
          >
            New custom discount
          </button>
        </div>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <Modal
          isOpen={isFormOpen}
          title={
            editingDiscountId === null ? 'Create discount' : 'Edit discount'
          }
          onClose={closeForm}
        >
          {isFormOpen ? (
            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <input
                  className={styles.input}
                  type="text"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  disabled={editingIsMandated}
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Discount type</span>
                <select
                  className={styles.input}
                  value={formDiscountType}
                  onChange={(event) =>
                    setFormDiscountType(event.target.value as DiscountValueType)
                  }
                >
                  {DISCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Discount value
                  {formDiscountType === 'Percentage' ? ' (%)' : ' (PHP)'}
                </span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  max={formDiscountType === 'Percentage' ? 100 : undefined}
                  step="0.01"
                  inputMode="decimal"
                  value={formValue}
                  onChange={(event) => setFormValue(event.target.value)}
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Scope</span>
                <select
                  className={styles.input}
                  value={formScopeType}
                  onChange={(event) => {
                    setFormScopeType(event.target.value as DiscountScopeType);
                    resetScopeFields();
                  }}
                >
                  <option value="service">Service</option>
                  <option value="package">Package</option>
                  <option value="category">Category</option>
                </select>
              </label>

              {formScopeType === 'service' ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Service</span>
                  <select
                    className={styles.input}
                    value={formScopeServiceId}
                    onChange={(event) =>
                      setFormScopeServiceId(event.target.value)
                    }
                    required
                  >
                    <option value="">Select a service...</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {formScopeType === 'package' ? (
                formBranchIds.length === 0 ? (
                  <p className={styles.copy}>
                    Select at least one branch to pick its packages.
                  </p>
                ) : (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Package</span>
                    <select
                      className={styles.input}
                      value={formScopePackageId}
                      onChange={(event) =>
                        setFormScopePackageId(event.target.value)
                      }
                      required
                    >
                      <option value="">Select a package...</option>
                      {packageOptionsForBranches.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : null}

              {formScopeType === 'category' ? (
                <DiscountCategoryScopeSelect
                  value={formScopeCategory}
                  onChange={setFormScopeCategory}
                />
              ) : null}

              <BranchMultiSelect
                label="Available at"
                branches={branches}
                selectedBranchIds={formBranchIds}
                onChange={setFormBranchIds}
              />

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
                  {isSubmitting ? 'Saving...' : 'Save discount'}
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
          ) : null}
        </Modal>

        <section aria-labelledby="mandated-heading">
          <h2 className={styles.sectionTitle} id="mandated-heading">
            Government-Mandated
          </h2>

          {mandatedDiscounts.length === 0 ? (
            <p className={styles.copy}>
              No mandated discounts match the selected filters.
            </p>
          ) : (
            <ul className={styles.discountList}>
              {mandatedDiscounts.map(renderDiscountRow)}
            </ul>
          )}
        </section>

        <section aria-labelledby="custom-heading">
          <h2 className={styles.sectionTitle} id="custom-heading">
            Custom Discounts
          </h2>

          {customDiscounts.length === 0 ? (
            <p className={styles.copy}>
              No custom discounts match the selected filters.
            </p>
          ) : (
            <ul className={styles.discountList}>
              {customDiscounts.map(renderDiscountRow)}
            </ul>
          )}
        </section>
      </div>

      <BranchAvailabilityModal
        isOpen={availabilityDiscount !== undefined}
        itemName={availabilityDiscount?.name ?? ''}
        rows={branches.map((branch) => ({
          branchId: branch.id,
          branchName: branch.name,
          isAvailable:
            (availabilityDiscount?.discount_branch_availability ?? []).find(
              (row) => row.branch_id === branch.id
            )?.is_available ?? false,
        }))}
        onToggle={(branchId, isAvailable) => {
          if (availabilityDiscount) {
            void handleBranchToggle(
              availabilityDiscount,
              branchId,
              isAvailable
            );
          }
        }}
        onClose={() => setAvailabilityDiscountId(null)}
      />
    </main>
  );
}
