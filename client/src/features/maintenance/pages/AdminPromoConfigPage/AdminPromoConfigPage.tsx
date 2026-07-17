import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createPromo,
  listBranches,
  listPackages,
  listPromos,
  listServices,
  updatePromo,
} from '../../api/maintenance.api';
import {
  ServiceMultiSelect,
  type ServiceMultiSelectOption,
} from '../../components/ServiceMultiSelect/ServiceMultiSelect';
import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import type {
  DiscountValueType,
  Package,
  Promo,
  PromoBranchScope,
  PromoScopeInput,
  PromoScopeType,
  Service,
} from '../../maintenance.types';
import styles from './AdminPromoConfigPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DISCOUNT_TYPES: DiscountValueType[] = ['Percentage', 'Flat'];
const BRANCH_SCOPES: PromoBranchScope[] = ['makati', 'southwoods', 'both'];

const BRANCH_SCOPE_LABELS: Record<PromoBranchScope, string> = {
  makati: 'Makati',
  southwoods: 'Southwoods',
  both: 'Both branches',
};

type StatusFilter = 'All' | 'Active' | 'Inactive';
type PromoKind = 'dateRange' | 'condition';

/**
 * ServiceMultiSelect (#46) takes an opaque id/label list, so a service-vs-
 * package union is modeled with a prefixed composite id rather than forking
 * the component (per #47 Dev Notes) - split back into a promo_scope payload
 * on submit, and parsed back into composite ids when opening an edit form.
 */
const SERVICE_PREFIX = 'svc:';
const PACKAGE_PREFIX = 'pkg:';

function toServiceCompositeId(serviceId: string): string {
  return `${SERVICE_PREFIX}${serviceId}`;
}

function toPackageCompositeId(packageId: string): string {
  return `${PACKAGE_PREFIX}${packageId}`;
}

function compositeIdsToScope(ids: string[]): PromoScopeInput[] {
  return ids.map((id) =>
    id.startsWith(SERVICE_PREFIX)
      ? { service_id: id.slice(SERVICE_PREFIX.length) }
      : { package_id: id.slice(PACKAGE_PREFIX.length) }
  );
}

function scopeToCompositeIds(promo: Promo): string[] {
  return (promo.promo_scope ?? []).map((item) =>
    item.service_id
      ? toServiceCompositeId(item.service_id)
      : toPackageCompositeId(item.package_id as string)
  );
}

function formatValue(promo: Promo): string {
  return promo.discount_type === 'Percentage'
    ? `${promo.value}% off`
    : `PHP ${promo.value.toFixed(2)} off`;
}

function formatWindow(promo: Promo): string {
  if (promo.condition_note) {
    return promo.condition_note;
  }

  if (promo.start_date && promo.end_date) {
    return `${promo.start_date} to ${promo.end_date}`;
  }

  return 'No window set';
}

export function AdminPromoConfigPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState<'All' | PromoBranchScope>(
    'All'
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDiscountType, setFormDiscountType] =
    useState<DiscountValueType>('Percentage');
  const [formValue, setFormValue] = useState('');
  const [formKind, setFormKind] = useState<PromoKind>('dateRange');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formConditionNote, setFormConditionNote] = useState('');
  const [formScopeType, setFormScopeType] =
    useState<PromoScopeType>('all_services');
  const [formScopeIds, setFormScopeIds] = useState<string[]>([]);
  const [formBranchScope, setFormBranchScope] =
    useState<PromoBranchScope>('both');
  const [formIsExclusive, setFormIsExclusive] = useState(false);
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
      listPromos(accessToken, { includeInactive: true }),
      // Active only - a promo should not offer a deactivated service/package
      // as a new scope target.
      listServices(accessToken),
      listPackages(accessToken),
      listBranches(),
    ]).then(([promosResult, servicesResult, packagesResult]) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (promosResult.error || !promosResult.data) {
        setLoadError(promosResult.error ?? 'Could not load promos.');
        return;
      }

      setPromos(promosResult.data);
      setServices(servicesResult.data ?? []);
      setPackages(packagesResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const filteredPromos = useMemo(() => {
    return promos.filter((promo) => {
      if (branchFilter !== 'All' && promo.branch_scope !== branchFilter) {
        return false;
      }

      if (statusFilter === 'Active' && !promo.is_active) {
        return false;
      }

      if (statusFilter === 'Inactive' && promo.is_active) {
        return false;
      }

      return true;
    });
  }, [promos, branchFilter, statusFilter]);

  // Existing scope selections (from an in-edit promo) stay offered even if
  // the referenced service/package has since gone inactive, so editing never
  // silently drops a selection.
  const scopeOptions: ServiceMultiSelectOption[] = useMemo(() => {
    const serviceOptions = services.map((service) => ({
      id: toServiceCompositeId(service.id),
      label: service.name,
      sublabel: `Service - ${service.category}`,
    }));

    const packageOptions = packages.map((pkg) => ({
      id: toPackageCompositeId(pkg.id),
      label: pkg.name,
      sublabel: 'Package',
    }));

    const known = new Set([
      ...serviceOptions.map((o) => o.id),
      ...packageOptions.map((o) => o.id),
    ]);

    const editingPromo =
      editingPromoId === null
        ? undefined
        : promos.find((promo) => promo.id === editingPromoId);

    const orphanedOptions = (editingPromo?.promo_scope ?? [])
      .filter((item) => {
        const id = item.service_id
          ? toServiceCompositeId(item.service_id)
          : toPackageCompositeId(item.package_id as string);
        return !known.has(id);
      })
      .map((item) =>
        item.service_id
          ? {
              id: toServiceCompositeId(item.service_id),
              label: 'Inactive service',
              sublabel: 'No longer offered',
            }
          : {
              id: toPackageCompositeId(item.package_id as string),
              label: 'Inactive package',
              sublabel: 'No longer offered',
            }
      );

    return [...serviceOptions, ...packageOptions, ...orphanedOptions];
  }, [services, packages, editingPromoId, promos]);

  const replacePromo = (updated: Promo) => {
    setPromos((prev) =>
      prev.map((promo) => (promo.id === updated.id ? updated : promo))
    );
  };

  const openCreateForm = () => {
    setEditingPromoId(null);
    setFormName('');
    setFormDiscountType('Percentage');
    setFormValue('');
    setFormKind('dateRange');
    setFormStartDate('');
    setFormEndDate('');
    setFormConditionNote('');
    setFormScopeType('all_services');
    setFormScopeIds([]);
    setFormBranchScope('both');
    setFormIsExclusive(false);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (promo: Promo) => {
    setEditingPromoId(promo.id);
    setFormName(promo.name);
    setFormDiscountType(promo.discount_type);
    setFormValue(String(promo.value));
    setFormKind(promo.condition_note ? 'condition' : 'dateRange');
    setFormStartDate(promo.start_date ?? '');
    setFormEndDate(promo.end_date ?? '');
    setFormConditionNote(promo.condition_note ?? '');
    setFormScopeType(promo.scope_type);
    setFormScopeIds(scopeToCompositeIds(promo));
    setFormBranchScope(promo.branch_scope);
    setFormIsExclusive(promo.is_exclusive);
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPromoId(null);
    setFormError(null);
  };

  const handleActiveToggle = async (promo: Promo) => {
    if (!accessToken) {
      return;
    }

    const result = await updatePromo(promo.id, accessToken, {
      is_active: !promo.is_active,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the promo.');
      return;
    }

    replacePromo(result.data);
    setMessage(
      result.data.is_active ? 'Promo reactivated.' : 'Promo deactivated.'
    );
  };

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

    if (formKind === 'dateRange' && (formStartDate === '' || formEndDate === '')) {
      setFormError('A date-bounded promo needs both a start and end date.');
      return;
    }

    if (formKind === 'condition' && formConditionNote.trim() === '') {
      setFormError('A condition-based promo needs a condition note.');
      return;
    }

    if (formScopeType === 'specific' && formScopeIds.length === 0) {
      setFormError('Select at least one service or package for this scope.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const scope =
      formScopeType === 'specific' ? compositeIdsToScope(formScopeIds) : [];

    if (editingPromoId === null) {
      const result = await createPromo(accessToken, {
        name: formName.trim(),
        ...(formKind === 'dateRange'
          ? { start_date: formStartDate, end_date: formEndDate }
          : { condition_note: formConditionNote.trim() }),
        discount_type: formDiscountType,
        value,
        scope_type: formScopeType,
        ...(formScopeType === 'specific' ? { scope } : {}),
        branch_scope: formBranchScope,
        is_exclusive: formIsExclusive,
      });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not create the promo.');
        return;
      }

      setPromos((prev) => [...prev, result.data as Promo]);
      setMessage('Promo created.');
      closeForm();
      return;
    }

    const result = await updatePromo(editingPromoId, accessToken, {
      name: formName.trim(),
      start_date: formKind === 'dateRange' ? formStartDate : null,
      end_date: formKind === 'dateRange' ? formEndDate : null,
      condition_note: formKind === 'condition' ? formConditionNote.trim() : null,
      discount_type: formDiscountType,
      value,
      scope_type: formScopeType,
      scope,
      branch_scope: formBranchScope,
      is_exclusive: formIsExclusive,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not update the promo.');
      return;
    }

    replacePromo(result.data);
    setMessage('Promo updated.');
    closeForm();
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the promo configuration panel.
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
        <p className={styles.copy}>Loading promos...</p>
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
      <h1 className={styles.title}>Promos</h1>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Branch scope</span>
            <select
              className={styles.filterSelect}
              value={branchFilter}
              onChange={(event) =>
                setBranchFilter(event.target.value as 'All' | PromoBranchScope)
              }
            >
              <option value="All">All</option>
              {BRANCH_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {BRANCH_SCOPE_LABELS[scope]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Status</span>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="Active">Active only</option>
              <option value="Inactive">Inactive only</option>
              <option value="All">All</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={openCreateForm}
        >
          New promo
        </button>
      </div>

      {message ? (
        <p className={styles.successBanner} role="status">
          {message}
        </p>
      ) : null}

      {isFormOpen ? (
        <section className={styles.formPanel} aria-labelledby="promo-form">
          <h2 className={styles.sectionTitle} id="promo-form">
            {editingPromoId === null ? 'Create promo' : 'Edit promo'}
          </h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                type="text"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
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
                Discount value{formDiscountType === 'Percentage' ? ' (%)' : ' (PHP)'}
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

            <div className={styles.segmentedControl} role="radiogroup" aria-label="Promo window type">
              <button
                type="button"
                className={
                  formKind === 'dateRange'
                    ? styles.segmentButtonActive
                    : styles.segmentButton
                }
                aria-pressed={formKind === 'dateRange'}
                onClick={() => setFormKind('dateRange')}
              >
                Date range
              </button>
              <button
                type="button"
                className={
                  formKind === 'condition'
                    ? styles.segmentButtonActive
                    : styles.segmentButton
                }
                aria-pressed={formKind === 'condition'}
                onClick={() => setFormKind('condition')}
              >
                Condition-based
              </button>
            </div>

            {formKind === 'dateRange' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Start date</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={formStartDate}
                    onChange={(event) => setFormStartDate(event.target.value)}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>End date</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={formEndDate}
                    onChange={(event) => setFormEndDate(event.target.value)}
                    required
                  />
                </label>
              </>
            ) : (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Condition note</span>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="e.g. First booking of the month"
                  value={formConditionNote}
                  onChange={(event) => setFormConditionNote(event.target.value)}
                  required
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Scope</span>
              <select
                className={styles.input}
                value={formScopeType}
                onChange={(event) => {
                  setFormScopeType(event.target.value as PromoScopeType);
                  setFormScopeIds([]);
                }}
              >
                <option value="all_services">All services</option>
                <option value="specific">Specific services/packages</option>
              </select>
            </label>

            {formScopeType === 'specific' ? (
              <ServiceMultiSelect
                label="Included services/packages"
                options={scopeOptions}
                selectedIds={formScopeIds}
                onChange={setFormScopeIds}
              />
            ) : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Branch scope</span>
              <select
                className={styles.input}
                value={formBranchScope}
                onChange={(event) =>
                  setFormBranchScope(event.target.value as PromoBranchScope)
                }
              >
                {BRANCH_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {BRANCH_SCOPE_LABELS[scope]}
                  </option>
                ))}
              </select>
            </label>

            <ToggleSwitch
              checked={formIsExclusive}
              onChange={setFormIsExclusive}
              label="Cannot be combined with other promos"
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
                {isSubmitting ? 'Saving...' : 'Save promo'}
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

      {filteredPromos.length === 0 ? (
        <p className={styles.copy}>No promos match the selected filters.</p>
      ) : (
        <ul className={styles.promoList}>
          {filteredPromos.map((promo) => (
            <li key={promo.id} className={styles.promoRow}>
              <div className={styles.promoMain}>
                <span className={styles.promoName}>{promo.name}</span>
                <span className={styles.branchBadge}>
                  {BRANCH_SCOPE_LABELS[promo.branch_scope]}
                </span>
                <span className={styles.promoMeta}>{formatValue(promo)}</span>
                <span className={styles.promoMeta}>{formatWindow(promo)}</span>
                {promo.is_exclusive ? (
                  <span className={styles.exclusiveBadge}>Exclusive</span>
                ) : null}
                <StatusBadge isActive={promo.is_active} />
              </div>

              <div className={styles.promoControls}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => openEditForm(promo)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleActiveToggle(promo)}
                >
                  {promo.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
