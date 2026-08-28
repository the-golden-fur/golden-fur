import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createService,
  getPricingConfiguration,
  listBranches,
  listServices,
  setServiceBranchAvailability,
  updateService,
} from '../../api/maintenance.api';
import { PricingMatrixPreview } from '../../components/PricingMatrixPreview/PricingMatrixPreview';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { BranchAvailabilityModal } from '../../components/BranchAvailabilityModal/BranchAvailabilityModal';
import { BranchMultiSelect } from '../../components/BranchMultiSelect/BranchMultiSelect';
import {
  SERVICE_CATEGORIES,
  type BranchSummary,
  type PricingConfiguration,
  type Service,
  type ServiceCategory,
  type UpdateServicePayload,
} from '../../maintenance.types';
import styles from './AdminServicesPage.module.css';

type ServiceSortKey = 'name-asc' | 'name-desc';

const SORT_OPTIONS: SortOption<ServiceSortKey>[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
];

function availableBranchIds(service: Service): string[] {
  return (service.service_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/** Same list as MAINTENANCE_WRITE_ROLES server-side - this page is a write
 * surface, so the UI guard matches the API/RLS boundary by construction. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type StatusFilter = 'All' | 'Active' | 'Inactive';

interface ServiceFormState {
  name: string;
  category: ServiceCategory;
  basePrice: string;
  durationMinutes: string;
  requiresAssessedPet: boolean;
  capturesPetAssessment: boolean;
  minNightsForFreePackage: string;
  freePackageName: string;
  usePricingMatrix: boolean;
  firstHourFee: string;
  succeedingHourFee: string;
  daycareOvernightFee: string;
  branchIds: string[];
}

const EMPTY_FORM: ServiceFormState = {
  name: '',
  category: 'Grooming',
  basePrice: '',
  durationMinutes: '',
  requiresAssessedPet: true,
  capturesPetAssessment: false,
  minNightsForFreePackage: '',
  freePackageName: '',
  usePricingMatrix: false,
  firstHourFee: '',
  succeedingHourFee: '',
  daycareOvernightFee: '',
  branchIds: [],
};

function formStateFromService(service: Service): ServiceFormState {
  return {
    name: service.name,
    category: service.category,
    basePrice: String(service.base_price),
    durationMinutes:
      service.duration_minutes === null ? '' : String(service.duration_minutes),
    requiresAssessedPet: service.requires_assessed_pet,
    capturesPetAssessment: service.captures_pet_assessment,
    minNightsForFreePackage:
      service.min_nights_for_free_package === null
        ? ''
        : String(service.min_nights_for_free_package),
    freePackageName: service.free_package_name ?? '',
    usePricingMatrix: service.use_pricing_matrix,
    firstHourFee:
      service.first_hour_fee === null ? '' : String(service.first_hour_fee),
    succeedingHourFee:
      service.succeeding_hour_fee === null
        ? ''
        : String(service.succeeding_hour_fee),
    daycareOvernightFee:
      service.daycare_overnight_fee === null
        ? ''
        : String(service.daycare_overnight_fee),
    branchIds: availableBranchIds(service),
  };
}

export function AdminServicesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [pricingConfiguration, setPricingConfiguration] =
    useState<PricingConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'All'>(
    'All'
  );
  const [branchFilter, setBranchFilter] = useState('All');
  // Custom change (services/packages actions menu): the row-level global
  // Disable toggle is gone - per-branch availability (below) is now the only
  // UI-driven way to take a service off sale, since it already fully covers
  // "unavailable everywhere" (a judgment call: is_active itself is still a
  // real column, just no longer settable here post-creation).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [availabilityServiceId, setAvailabilityServiceId] = useState<
    string | null
  >(null);

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
      getPricingConfiguration(accessToken),
    ]).then(([servicesResult, branchesResult, pricingResult]) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (servicesResult.error || !servicesResult.data) {
        setLoadError(servicesResult.error ?? 'Could not load services.');
        return;
      }

      if (pricingResult.error || !pricingResult.data) {
        setLoadError(
          pricingResult.error ?? 'Could not load pricing configuration.'
        );
        return;
      }

      setServices(servicesResult.data);
      // Branch names are optional garnish - a failed lookup degrades toggle
      // labels, it doesn't block the page.
      setBranches(branchesResult.data ?? []);
      setPricingConfiguration(pricingResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const searchSortComparators = useMemo(
    () => ({
      'name-asc': (a: Service, b: Service) => a.name.localeCompare(b.name),
      'name-desc': (a: Service, b: Service) => b.name.localeCompare(a.name),
    }),
    []
  );

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: searchedServices,
  } = useSearchAndSort<Service, ServiceSortKey>({
    items: services,
    matchesQuery: (service, query) =>
      service.name.toLowerCase().includes(query),
    comparators: searchSortComparators,
    initialSortKey: 'name-asc',
  });

  const filteredServices = useMemo(() => {
    return searchedServices.filter((service) => {
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
  }, [searchedServices, categoryFilter, branchFilter, statusFilter]);

  const availabilityService = services.find(
    (service) => service.id === availabilityServiceId
  );

  const replaceService = (updated: Service) => {
    setServices((prev) =>
      prev.map((service) => (service.id === updated.id ? updated : service))
    );
  };

  const openCreateForm = () => {
    setEditingServiceId(null);
    setForm({ ...EMPTY_FORM, branchIds: branches.map((branch) => branch.id) });
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

    const result = await setServiceBranchAvailability(service.id, accessToken, {
      branch_id: branchId,
      is_available: isAvailable,
    });

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

  /**
   * Applies the create/edit form's branch multiselect to a just-created/
   * -updated service by diffing it against the row's current availability
   * and only calling setServiceBranchAvailability for branches whose
   * selection actually changed - avoids calling the single-toggle handler in
   * a loop against a stale closure, which would lose updates when merging
   * the resulting availability array back together.
   */
  async function applyBranchSelection(
    service: Service,
    selectedBranchIds: string[]
  ): Promise<Service> {
    if (!accessToken) {
      return service;
    }

    const rows = service.service_branch_availability ?? [];
    const changedBranches = branches.filter((branch) => {
      const current =
        rows.find((row) => row.branch_id === branch.id)?.is_available ?? false;
      const next = selectedBranchIds.includes(branch.id);
      return current !== next;
    });

    if (changedBranches.length === 0) {
      return service;
    }

    const results = await Promise.all(
      changedBranches.map((branch) =>
        setServiceBranchAvailability(service.id, accessToken, {
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

    return { ...service, service_branch_availability: updatedRows };
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    if (form.name.trim() === '') {
      setFormError('A name is required.');
      return;
    }

    // Custom change (Daycare fee configuration follow-up): base_price isn't
    // admin-entered for Daycare - the server derives it from first_hour_fee
    // instead (services.service.ts), so it's neither shown nor validated
    // here for that category.
    const basePrice = Number(form.basePrice);

    if (
      form.category !== 'Daycare' &&
      (form.basePrice === '' || basePrice < 0)
    ) {
      setFormError('A non-negative base price is required.');
      return;
    }

    const firstHourFee =
      form.firstHourFee === '' ? undefined : Number(form.firstHourFee);
    const succeedingHourFee =
      form.succeedingHourFee === ''
        ? undefined
        : Number(form.succeedingHourFee);
    const daycareOvernightFee =
      form.daycareOvernightFee === ''
        ? undefined
        : Number(form.daycareOvernightFee);

    if (
      form.category === 'Daycare' &&
      (firstHourFee === undefined ||
        succeedingHourFee === undefined ||
        firstHourFee < 0 ||
        succeedingHourFee < 0 ||
        (daycareOvernightFee !== undefined && daycareOvernightFee < 0))
    ) {
      setFormError(
        'A Daycare service needs a non-negative first-hour fee and succeeding-hour fee.'
      );
      return;
    }

    const durationMinutes =
      form.durationMinutes === '' ? undefined : Number(form.durationMinutes);
    const minNightsForFreePackage =
      form.category === 'Hotel' && form.minNightsForFreePackage !== ''
        ? Number(form.minNightsForFreePackage)
        : undefined;
    const freePackageName =
      form.category === 'Hotel' && form.freePackageName.trim() !== ''
        ? form.freePackageName.trim()
        : undefined;

    setIsSubmitting(true);
    setFormError(null);

    if (editingServiceId === null) {
      const result = await createService(accessToken, {
        name: form.name.trim(),
        category: form.category,
        requires_assessed_pet: form.requiresAssessedPet,
        captures_pet_assessment: form.capturesPetAssessment,
        use_pricing_matrix: form.usePricingMatrix,
        ...(form.category !== 'Daycare' ? { base_price: basePrice } : {}),
        ...(durationMinutes !== undefined
          ? { duration_minutes: durationMinutes }
          : {}),
        ...(minNightsForFreePackage !== undefined
          ? { min_nights_for_free_package: minNightsForFreePackage }
          : {}),
        ...(freePackageName !== undefined
          ? { free_package_name: freePackageName }
          : {}),
        ...(firstHourFee !== undefined ? { first_hour_fee: firstHourFee } : {}),
        ...(succeedingHourFee !== undefined
          ? { succeeding_hour_fee: succeedingHourFee }
          : {}),
        ...(daycareOvernightFee !== undefined
          ? { daycare_overnight_fee: daycareOvernightFee }
          : {}),
      });

      if (result.error || !result.data) {
        setIsSubmitting(false);
        setFormError(result.error ?? 'Could not create the service.');
        return;
      }

      const finalService = await applyBranchSelection(
        result.data,
        form.branchIds
      );

      setIsSubmitting(false);
      setServices((prev) => [...prev, finalService]);
      setMessage('Service created.');
      closeForm();
      return;
    }

    const payload: UpdateServicePayload = {
      name: form.name.trim(),
      category: form.category,
      duration_minutes: durationMinutes ?? null,
      requires_assessed_pet: form.requiresAssessedPet,
      captures_pet_assessment: form.capturesPetAssessment,
      min_nights_for_free_package: minNightsForFreePackage ?? null,
      free_package_name: freePackageName ?? null,
      use_pricing_matrix: form.usePricingMatrix,
      first_hour_fee: firstHourFee ?? null,
      succeeding_hour_fee: succeedingHourFee ?? null,
      daycare_overnight_fee: daycareOvernightFee ?? null,
      ...(form.category !== 'Daycare' ? { base_price: basePrice } : {}),
    };

    const result = await updateService(editingServiceId, accessToken, payload);

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setFormError(result.error ?? 'Could not update the service.');
      return;
    }

    const finalService = await applyBranchSelection(
      result.data,
      form.branchIds
    );

    setIsSubmitting(false);
    replaceService(finalService);
    setMessage('Service updated.');
    closeForm();
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the services panel.
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

  // Only decided once the role fetch has resolved, so an Admin/Superadmin
  // never flashes through this redirect (same ordering as the other admin
  // pages).
  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading services...</p>
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
        <h1 className={styles.title}>Services</h1>

        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <SearchSortBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search services..."
              sortValue={sortKey}
              onSortChange={setSortKey}
              sortOptions={SORT_OPTIONS}
            />

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

        <Modal
          isOpen={isFormOpen}
          title={editingServiceId === null ? 'Create service' : 'Edit service'}
          onClose={closeForm}
        >
          {isFormOpen ? (
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

              {form.category !== 'Daycare' ? (
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
              ) : null}

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
                <ToggleSwitch
                  label="Derive price from weight/coat matrix (off = flat base price for every pet, except this never applies to Cats either way)"
                  checked={form.usePricingMatrix}
                  onChange={(checked) =>
                    setForm((prev) => ({ ...prev, usePricingMatrix: checked }))
                  }
                />
              ) : null}

              {form.category === 'Grooming' &&
              form.usePricingMatrix &&
              pricingConfiguration ? (
                <PricingMatrixPreview
                  basePrice={Number(form.basePrice) || 0}
                  configuration={pricingConfiguration}
                />
              ) : null}

              {form.category === 'Hotel' ? (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Free package after this many nights (optional)
                    </span>
                    <input
                      className={styles.input}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      placeholder="e.g. 5"
                      value={form.minNightsForFreePackage}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          minNightsForFreePackage: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Free package name (matched against this branch&apos;s
                      packages at booking time)
                    </span>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="e.g. Golden Package"
                      value={form.freePackageName}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          freePackageName: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}

              {form.category === 'Daycare' ? (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      First hour fee (PHP)
                    </span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="e.g. 100"
                      value={form.firstHourFee}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          firstHourFee: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Succeeding hour fee (PHP, per additional billable hour)
                    </span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="e.g. 50"
                      value={form.succeedingHourFee}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          succeedingHourFee: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Overnight fee (PHP/night, charged when not picked up
                      before closing - optional, defaults to ₱850)
                    </span>
                    <input
                      className={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="e.g. 850"
                      value={form.daycareOvernightFee}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          daycareOvernightFee: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}

              <ToggleSwitch
                label="Requires an assessed pet (off for something like Initial Assessment, which a pet with no recorded weight/coat can still book)"
                checked={form.requiresAssessedPet}
                onChange={(checked) =>
                  setForm((prev) => ({ ...prev, requiresAssessedPet: checked }))
                }
              />

              <ToggleSwitch
                label="Capture pet weight/coat on Start (opens a modal to record/update the pet's assessment before the booking advances - for Initial Assessment/Reassessment-style services)"
                checked={form.capturesPetAssessment}
                onChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    capturesPetAssessment: checked,
                  }))
                }
              />

              <BranchMultiSelect
                label="Available at"
                branches={branches}
                selectedBranchIds={form.branchIds}
                onChange={(branchIds) =>
                  setForm((prev) => ({ ...prev, branchIds }))
                }
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
          ) : null}
        </Modal>

        {filteredServices.length === 0 ? (
          <p className={styles.copy}>No services match the selected filters.</p>
        ) : (
          <ul className={styles.serviceList}>
            {filteredServices.map((service) => (
              <li key={service.id} className={styles.serviceRow}>
                <div className={styles.serviceMain}>
                  <span className={styles.serviceName}>{service.name}</span>
                  <span className={styles.categoryBadge}>
                    {service.category}
                  </span>
                  {service.category !== 'Daycare' ? (
                    <span className={styles.servicePrice}>
                      PHP {service.base_price.toFixed(2)}
                    </span>
                  ) : null}
                  {!service.requires_assessed_pet ? (
                    <span className={styles.categoryBadge}>
                      No assessment required
                    </span>
                  ) : null}
                  {service.category === 'Grooming' &&
                  service.use_pricing_matrix ? (
                    <span className={styles.categoryBadge}>
                      Varies by weight/coat
                    </span>
                  ) : null}
                  {service.min_nights_for_free_package &&
                  service.free_package_name ? (
                    <span className={styles.categoryBadge}>
                      {service.min_nights_for_free_package}+ nights: free{' '}
                      {service.free_package_name}
                    </span>
                  ) : null}
                  {service.category === 'Daycare' &&
                  service.first_hour_fee !== null &&
                  service.succeeding_hour_fee !== null ? (
                    <span className={styles.categoryBadge}>
                      PHP {service.first_hour_fee.toFixed(2)} first hr, PHP{' '}
                      {service.succeeding_hour_fee.toFixed(2)}/hr after
                    </span>
                  ) : null}
                  {service.category === 'Daycare' ? (
                    <span className={styles.categoryBadge}>
                      PHP {(service.daycare_overnight_fee ?? 850).toFixed(2)}
                      /night if not picked up
                    </span>
                  ) : null}
                </div>

                <div className={styles.serviceControls}>
                  <MoreOptionsMenu
                    label={`Actions for ${service.name}`}
                    items={[
                      {
                        label: 'Configure',
                        onSelect: () => openEditForm(service),
                      },
                      {
                        label: 'Branch Availability',
                        onSelect: () => setAvailabilityServiceId(service.id),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BranchAvailabilityModal
        isOpen={availabilityService !== undefined}
        itemName={availabilityService?.name ?? ''}
        rows={branches.map((branch) => ({
          branchId: branch.id,
          branchName: branch.name,
          isAvailable:
            (availabilityService?.service_branch_availability ?? []).find(
              (row) => row.branch_id === branch.id
            )?.is_available ?? false,
        }))}
        onToggle={(branchId, isAvailable) => {
          if (availabilityService) {
            void handleBranchToggle(availabilityService, branchId, isAvailable);
          }
        }}
        onClose={() => setAvailabilityServiceId(null)}
      />
    </main>
  );
}
