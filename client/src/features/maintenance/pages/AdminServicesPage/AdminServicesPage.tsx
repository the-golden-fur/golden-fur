import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createService,
  listBranches,
  listServices,
  setServiceBranchAvailability,
  updateService,
} from '../../api/maintenance.api';
import { ServicePricingTierEditor } from '../../components/ServicePricingTierEditor/ServicePricingTierEditor';
import { StatusBadge } from '../../components/shared/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../components/shared/ToggleSwitch/ToggleSwitch';
import {
  SERVICE_CATEGORIES,
  type BranchSummary,
  type PricingTierInput,
  type Service,
  type ServiceCategory,
  type UpdateServicePayload,
} from '../../maintenance.types';
import styles from './AdminServicesPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side - this page is a write
 * surface, so the UI guard matches the API/RLS boundary by construction. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type StatusFilter = 'All' | 'Active' | 'Inactive';

interface ServiceFormState {
  name: string;
  category: ServiceCategory;
  basePrice: string;
  durationMinutes: string;
  tiers: PricingTierInput[];
}

const EMPTY_FORM: ServiceFormState = {
  name: '',
  category: 'Grooming',
  basePrice: '',
  durationMinutes: '',
  tiers: [],
};

function formStateFromService(service: Service): ServiceFormState {
  return {
    name: service.name,
    category: service.category,
    basePrice: String(service.base_price),
    durationMinutes:
      service.duration_minutes === null
        ? ''
        : String(service.duration_minutes),
    tiers: (service.service_pricing_tiers ?? []).map((tier) => ({
      weight_class: tier.weight_class,
      coat_type: tier.coat_type,
      price: tier.price,
    })),
  };
}

export function AdminServicesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<
    ServiceCategory | 'All'
  >('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(
    null
  );
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Same trick as AdminStaffListPage/AdminCustomerListPage: the viewer's
  // app-level role isn't on the Supabase session, so it's read off their own
  // row in the staff list (GET /staff always includes the requester's row).
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
      listServices(accessToken, { includeInactive: true }),
      listBranches(),
    ]).then(([servicesResult, branchesResult]) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (servicesResult.error || !servicesResult.data) {
        setLoadError(servicesResult.error ?? 'Could not load services.');
        return;
      }

      setServices(servicesResult.data);
      // Branch names are optional garnish - a failed lookup degrades toggle
      // labels, it doesn't block the page.
      setBranches(branchesResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      if (categoryFilter !== 'All' && service.category !== categoryFilter) {
        return false;
      }

      if (statusFilter === 'Active' && !service.is_active) {
        return false;
      }

      if (statusFilter === 'Inactive' && service.is_active) {
        return false;
      }

      if (branchFilter !== 'All') {
        const available = (service.service_branch_availability ?? []).some(
          (row) => row.branch_id === branchFilter && row.is_available
        );

        if (!available) {
          return false;
        }
      }

      return true;
    });
  }, [services, categoryFilter, branchFilter, statusFilter]);

  const replaceService = (updated: Service) => {
    setServices((prev) =>
      prev.map((service) => (service.id === updated.id ? updated : service))
    );
  };

  const openCreateForm = () => {
    setEditingServiceId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (service: Service) => {
    setEditingServiceId(service.id);
    setForm(formStateFromService(service));
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingServiceId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleBranchToggle = async (
    service: Service,
    branchId: string,
    isAvailable: boolean
  ) => {
    if (!accessToken) {
      return;
    }

    const result = await setServiceBranchAvailability(
      service.id,
      accessToken,
      { branch_id: branchId, is_available: isAvailable }
    );

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update branch availability.');
      return;
    }

    const rows = service.service_branch_availability ?? [];
    const hasRow = rows.some((row) => row.branch_id === branchId);

    replaceService({
      ...service,
      service_branch_availability: hasRow
        ? rows.map((row) =>
            row.branch_id === branchId ? { ...row, ...result.data } : row
          )
        : [...rows, result.data],
    });
  };

  const handleActiveToggle = async (service: Service) => {
    if (!accessToken) {
      return;
    }

    const result = await updateService(service.id, accessToken, {
      is_active: !service.is_active,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the service.');
      return;
    }

    replaceService(result.data);
    setMessage(
      result.data.is_active ? 'Service reactivated.' : 'Service deactivated.'
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const basePrice = Number(form.basePrice);

    if (form.name.trim() === '' || form.basePrice === '' || basePrice < 0) {
      setFormError('A name and a non-negative base price are required.');
      return;
    }

    const isGrooming = form.category === 'Grooming';
    const durationMinutes =
      form.durationMinutes === '' ? undefined : Number(form.durationMinutes);

    setIsSubmitting(true);
    setFormError(null);

    if (editingServiceId === null) {
      const result = await createService(accessToken, {
        name: form.name.trim(),
        category: form.category,
        base_price: basePrice,
        ...(durationMinutes !== undefined
          ? { duration_minutes: durationMinutes }
          : {}),
        ...(isGrooming && form.tiers.length > 0
          ? { pricing_tiers: form.tiers }
          : {}),
      });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not create the service.');
        return;
      }

      setServices((prev) => [...prev, result.data as Service]);
      setMessage('Service created.');
      closeForm();
      return;
    }

    const payload: UpdateServicePayload = {
      name: form.name.trim(),
      category: form.category,
      base_price: basePrice,
      duration_minutes: durationMinutes ?? null,
    };

    if (isGrooming && form.tiers.length > 0) {
      payload.pricing_tiers = form.tiers;
    }

    const result = await updateService(editingServiceId, accessToken, payload);

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not update the service.');
      return;
    }

    replaceService(result.data);
    setMessage('Service updated.');
    closeForm();
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the services panel.
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

  // Only decided once the role fetch has resolved, so an Admin/Superadmin
  // never flashes through this redirect (same ordering as the other admin
  // pages).
  if (!isAllowedViewer) {
    return <Navigate to="/staff/profile" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading services...</p>
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
      <h1 className={styles.title}>Services</h1>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Category</span>
            <select
              className={styles.filterSelect}
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value as ServiceCategory | 'All'
                )
              }
            >
              <option value="All">All categories</option>
              {SERVICE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

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
          New service
        </button>
      </div>

      {message ? (
        <p className={styles.successBanner} role="status">
          {message}
        </p>
      ) : null}

      {isFormOpen ? (
        <section className={styles.formPanel} aria-labelledby="service-form">
          <h2 className={styles.sectionTitle} id="service-form">
            {editingServiceId === null ? 'Create service' : 'Edit service'}
          </h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Category</span>
              <select
                className={styles.input}
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    category: event.target.value as ServiceCategory,
                  }))
                }
              >
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Base price (PHP)</span>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.basePrice}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    basePrice: event.target.value,
                  }))
                }
                required
              />
            </label>

            {form.category === 'Hotel' || form.category === 'Daycare' ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Duration (minutes per block/night)
                </span>
                <input
                  className={styles.input}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.durationMinutes}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            {form.category === 'Grooming' ? (
              <ServicePricingTierEditor
                tiers={form.tiers}
                onChange={(tiers) => setForm((prev) => ({ ...prev, tiers }))}
              />
            ) : null}

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
                {isSubmitting ? 'Saving...' : 'Save service'}
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

      {filteredServices.length === 0 ? (
        <p className={styles.copy}>
          No services match the selected filters.
        </p>
      ) : (
        <ul className={styles.serviceList}>
          {filteredServices.map((service) => (
            <li key={service.id} className={styles.serviceRow}>
              <div className={styles.serviceMain}>
                <span className={styles.serviceName}>{service.name}</span>
                <span className={styles.categoryBadge}>
                  {service.category}
                </span>
                <span className={styles.servicePrice}>
                  PHP {service.base_price.toFixed(2)}
                </span>
                <StatusBadge isActive={service.is_active} />
              </div>

              <div className={styles.serviceControls}>
                {branches.map((branch) => {
                  const availability = (
                    service.service_branch_availability ?? []
                  ).find((row) => row.branch_id === branch.id);

                  return (
                    <ToggleSwitch
                      key={branch.id}
                      label={branch.name}
                      checked={availability?.is_available ?? false}
                      onChange={(isAvailable) =>
                        void handleBranchToggle(
                          service,
                          branch.id,
                          isAvailable
                        )
                      }
                    />
                  );
                })}

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => openEditForm(service)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleActiveToggle(service)}
                >
                  {service.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
