import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archivePromo,
  createPromo,
  listBranches,
  listPackages,
  listPromoCapConfigurations,
  listPromos,
  listServices,
  updatePromo,
  upsertPromoCapConfiguration,
} from '../../api/maintenance.api';
import {
  ServiceMultiSelect,
  type ServiceMultiSelectOption,
} from '../../components/ServiceMultiSelect/ServiceMultiSelect';
import { PromoCard } from '../../components/PromoCard/PromoCard';
import { PromoCapCard } from '../../components/PromoCapCard/PromoCapCard';
import {
  PromoFilterBar,
  type PromoBranchScopeFilter,
  type PromoStatusFilter,
  type PromoTimingFilter,
} from '../../components/PromoFilterBar/PromoFilterBar';
import { getPromoTiming } from '../../utils/promoTiming';
import type {
  BranchSummary,
  CapType,
  DiscountValueType,
  Package,
  Promo,
  PromoBranchScope,
  PromoCapConfiguration,
  PromoScopeInput,
  PromoScopeType,
  Service,
} from '../../maintenance.types';
import styles from './AdminPromoConfigPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DISCOUNT_TYPES: DiscountValueType[] = ['Percentage', 'Flat'];
const BRANCH_SCOPES: PromoBranchScope[] = ['makati', 'southwoods', 'both'];
const DEFAULT_CAP_SCOPE_KEY = 'default';

const BRANCH_SCOPE_LABELS: Record<PromoBranchScope, string> = {
  makati: 'Makati',
  southwoods: 'Southwoods',
  both: 'Both branches',
};

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

export function AdminPromoConfigPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [branchScopeFilter, setBranchScopeFilter] =
    useState<PromoBranchScopeFilter>('All');
  const [timingFilter, setTimingFilter] = useState<PromoTimingFilter>('All');
  const [statusFilter, setStatusFilter] = useState<PromoStatusFilter>('Active');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDiscountType, setFormDiscountType] =
    useState<DiscountValueType>('Percentage');
  const [formValue, setFormValue] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formScopeType, setFormScopeType] =
    useState<PromoScopeType>('all_services');
  const [formScopeIds, setFormScopeIds] = useState<string[]>([]);
  const [formBranchScope, setFormBranchScope] =
    useState<PromoBranchScope>('both');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [capBranches, setCapBranches] = useState<BranchSummary[]>([]);
  const [capConfigurations, setCapConfigurations] = useState<
    PromoCapConfiguration[]
  >([]);
  const [capLoadError, setCapLoadError] = useState<string | null>(null);
  const [savingCapScopeKey, setSavingCapScopeKey] = useState<string | null>(
    null
  );
  const [capMessage, setCapMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void Promise.all([
      listBranches(),
      listPromoCapConfigurations(accessToken),
    ]).then(([branchesResult, capResult]) => {
      if (!isMounted) {
        return;
      }

      if (capResult.error || !capResult.data) {
        setCapLoadError(capResult.error ?? 'Could not load the promo cap.');
        return;
      }

      setCapLoadError(null);
      setCapBranches(branchesResult.data ?? []);
      setCapConfigurations(capResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const handleSaveCap = async (
    branchId: string | null,
    scopeKey: string,
    input: { cap_type: CapType; cap_value: number }
  ) => {
    if (!accessToken) {
      return;
    }

    setSavingCapScopeKey(scopeKey);

    const result = await upsertPromoCapConfiguration(accessToken, {
      branch_id: branchId,
      ...input,
    });

    setSavingCapScopeKey(null);

    if (result.error || !result.data) {
      setCapMessage(result.error ?? 'Could not update the promo cap.');
      return;
    }

    const saved = result.data;
    setCapConfigurations((prev) => {
      const exists = prev.some(
        (config) => config.branch_id === saved.branch_id
      );
      return exists
        ? prev.map((config) =>
            config.branch_id === saved.branch_id ? saved : config
          )
        : [...prev, saved];
    });
    setCapMessage('Promo cap updated.');
  };

  const filteredPromos = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return promos.filter((promo) => {
      if (
        branchScopeFilter !== 'All' &&
        promo.branch_scope !== branchScopeFilter
      ) {
        return false;
      }

      if (statusFilter === 'Active' && !promo.is_active) {
        return false;
      }

      if (statusFilter === 'Inactive' && promo.is_active) {
        return false;
      }

      if (timingFilter !== 'All' && getPromoTiming(promo) !== timingFilter) {
        return false;
      }

      if (searchTerm && !promo.name.toLowerCase().includes(searchTerm)) {
        return false;
      }

      return true;
    });
  }, [promos, branchScopeFilter, statusFilter, timingFilter, search]);

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
    setFormStartDate('');
    setFormEndDate('');
    setFormScopeType('all_services');
    setFormScopeIds([]);
    setFormBranchScope('both');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (promo: Promo) => {
    setEditingPromoId(promo.id);
    setFormName(promo.name);
    setFormDiscountType(promo.discount_type);
    setFormValue(String(promo.value));
    setFormStartDate(promo.start_date ?? '');
    setFormEndDate(promo.end_date ?? '');
    setFormScopeType(promo.scope_type);
    setFormScopeIds(scopeToCompositeIds(promo));
    setFormBranchScope(promo.branch_scope);
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPromoId(null);
    setFormError(null);
  };

  const handleActiveToggle = async (promo: Promo, isActive: boolean) => {
    if (!accessToken) {
      return;
    }

    const result = await updatePromo(promo.id, accessToken, {
      is_active: isActive,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the promo.');
      return;
    }

    replacePromo(result.data);
    setMessage(isActive ? 'Promo reactivated.' : 'Promo deactivated.');
  };

  const handleArchive = async (promo: Promo) => {
    if (!accessToken) {
      return;
    }

    const result = await archivePromo(promo.id, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setPromos((prev) => prev.filter((item) => item.id !== promo.id));
    setMessage('Promo archived.');
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

    if (formStartDate === '' || formEndDate === '') {
      setFormError('A promo needs both a start and end date.');
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
        start_date: formStartDate,
        end_date: formEndDate,
        discount_type: formDiscountType,
        value,
        scope_type: formScopeType,
        ...(formScopeType === 'specific' ? { scope } : {}),
        branch_scope: formBranchScope,
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
      start_date: formStartDate,
      end_date: formEndDate,
      // Clears any legacy condition-based window this promo may have had -
      // the create/edit form is date-range only now, so the two can never
      // coexist (the server rejects a promo that's both anyway).
      condition_note: null,
      discount_type: formDiscountType,
      value,
      scope_type: formScopeType,
      scope,
      branch_scope: formBranchScope,
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
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the promo configuration panel.
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
          <p className={styles.copy}>Loading promos...</p>
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

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Promos</h1>
          <Link
            className={styles.archiveLink}
            to="/staff/admin/archive?tab=promos"
          >
            View archive
          </Link>
        </div>

        <div className={styles.toolbar}>
          <PromoFilterBar
            search={search}
            onSearchChange={setSearch}
            branchScopeFilter={branchScopeFilter}
            onBranchScopeFilterChange={setBranchScopeFilter}
            timingFilter={timingFilter}
            onTimingFilterChange={setTimingFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

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
          <div className={styles.promoGrid}>
            {filteredPromos.map((promo) => (
              <PromoCard
                key={promo.id}
                promo={promo}
                onToggle={(isActive) =>
                  void handleActiveToggle(promo, isActive)
                }
                onEdit={() => openEditForm(promo)}
                onArchive={() => void handleArchive(promo)}
              />
            ))}
          </div>
        )}

        <section aria-labelledby="promo-cap-heading">
          <h2 className={styles.sectionTitle} id="promo-cap-heading">
            Promo Cap Configuration
          </h2>
          <p className={styles.copy}>
            Maximum total discount value that all combined, customer-activated
            promos may contribute to one transaction. Each branch (and the
            system-wide default) has its own cap, viewed and saved
            independently.
          </p>

          {capMessage ? (
            <p className={styles.successBanner} role="status">
              {capMessage}
            </p>
          ) : null}

          {capLoadError ? (
            <p className={styles.errorBanner} role="alert">
              {capLoadError}
            </p>
          ) : (
            <div className={styles.promoGrid}>
              <PromoCapCard
                key={`default-${capConfigurations.find((config) => config.branch_id === null)?.id ?? 'unsaved'}`}
                scopeLabel="Both branches (system-wide default)"
                config={capConfigurations.find(
                  (config) => config.branch_id === null
                )}
                onSave={(input) =>
                  void handleSaveCap(null, DEFAULT_CAP_SCOPE_KEY, input)
                }
                isSaving={savingCapScopeKey === DEFAULT_CAP_SCOPE_KEY}
              />
              {capBranches.map((branch) => {
                const config = capConfigurations.find(
                  (candidate) => candidate.branch_id === branch.id
                );

                return (
                  <PromoCapCard
                    key={`${branch.id}-${config?.id ?? 'unsaved'}`}
                    scopeLabel={branch.name}
                    config={config}
                    onSave={(input) =>
                      void handleSaveCap(branch.id, branch.id, input)
                    }
                    isSaving={savingCapScopeKey === branch.id}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
