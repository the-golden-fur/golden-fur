import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archiveService,
  createService,
  getPricingConfiguration,
  listBranches,
  listServices,
  setServiceBranchAvailability,
  setServiceBranchPrice,
  updateService,
} from '../../api/maintenance.api';
import { PricingMatrixPreview } from '../../components/PricingMatrixPreview/PricingMatrixPreview';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { CardRowWithMenu } from '../../../../shared/components/MoreOptionsMenu/CardRowWithMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { useRenameAndArchive } from '../../../../shared/hooks/useRenameAndArchive/useRenameAndArchive';
import { BranchMultiSelect } from '../../components/BranchMultiSelect/BranchMultiSelect';
import { IconPicker } from '../../../../shared/components/IconPicker/IconPicker';
import { getServiceIcon } from '../../../../shared/components/IconPicker/serviceIcons';
import { ImageUploader } from '../../../../shared/components/ImageUploader/ImageUploader';
import { uploadServiceImage } from '../../api/maintenance.api';
import {
  SERVICE_CATEGORIES,
  type BranchSummary,
  type PricingConfiguration,
  type Service,
  type ServiceCategory,
  type UpdateServicePayload,
} from '../../maintenance.types';
import {
  applyServiceFilters,
  buildServiceFilterFields,
  deriveServiceSortKey,
  matchesServiceQuery,
  SERVICE_COMPARATORS,
  SERVICE_GROUP_BY_AXES,
  SERVICE_SORT_FIELDS,
} from './serviceBrowserFields';
import styles from './AdminServicesPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function availableBranchIds(service: Service): string[] {
  return (service.service_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/** Same list as MAINTENANCE_WRITE_ROLES server-side - this page is a write
 * surface, so the UI guard matches the API/RLS boundary by construction. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

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
  /** Superadmin-only: a branch's own price for this service, keyed by
   * branch id, as typed. '' (or no entry) = the branch charges the base
   * price. */
  branchPrices: Record<string, string>;
  icon: string | null;
  imageUrl: string | null;
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
  branchPrices: {},
  icon: null,
  imageUrl: null,
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
    branchPrices: Object.fromEntries(
      (service.service_branch_availability ?? [])
        .filter((row) => row.price_override != null)
        .map((row) => [row.branch_id, String(row.price_override)])
    ),
    icon: service.icon,
    imageUrl: service.image_url,
  };
}

export function AdminServicesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [pricingConfiguration, setPricingConfiguration] =
    useState<PricingConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([
    // Custom change (services/packages actions menu): the row-level global
    // Disable toggle is gone - per-branch availability (below) is now the
    // only UI-driven way to take a service off sale. The page has always
    // defaulted to showing only active services - kept as a pre-added tile.
    { fieldId: 'status', value: 'active' },
  ]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(SERVICE_GROUP_BY_AXES[0].id);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  // The form as it was when the modal opened - what `form` is compared
  // against to tell whether there are unsaved edits (see requestCloseForm).
  const [initialForm, setInitialForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
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
      setViewerBranchId(self?.branch_id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);
  // An Admin is scoped to their own branch's availability; Superadmin can
  // touch any branch.
  const lockedBranchId = viewerRole === 'Admin' ? viewerBranchId : null;
  // A branch's own price is a cross-branch pricing decision - Superadmin
  // only, here and on the server.
  const canSetBranchPrices = viewerRole === 'Superadmin';

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

  const filterFields = useMemo(
    () => buildServiceFilterFields(branches),
    [branches]
  );

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? services.filter((service) => matchesServiceQuery(service, query))
      : services;
    const filtered = applyServiceFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      SERVICE_COMPARATORS[deriveServiceSortKey(sortTile)]
    );
  }, [services, search, filterTiles, sortTile]);

  const activeGroupAxis =
    SERVICE_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedServices = useGroupBy(
    filteredServices,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = filterFields.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  const replaceService = (updated: Service) => {
    setServices((prev) =>
      prev.map((service) => (service.id === updated.id ? updated : service))
    );
  };

  const { requestRename, requestArchive, dialogs } =
    useRenameAndArchive<Service>({
      entityLabel: 'service',
      getName: (service) => service.name,
      archiveConsequence:
        'it will be hidden from booking and the service catalog',
      onRename: async (service, name) => {
        if (!accessToken) return 'You are signed out.';

        const result = await updateService(service.id, accessToken, { name });

        if (result.error || !result.data) {
          return result.error ?? 'Could not rename service.';
        }

        replaceService(result.data);
        setMessage('Service renamed.');
        return null;
      },
      onArchive: async (service) => {
        if (!accessToken) return 'You are signed out.';

        const result = await archiveService(service.id, accessToken);

        if (result.error) return result.error;

        setServices((prev) => prev.filter((row) => row.id !== service.id));
        setMessage(
          'Service archived. Restore it from Settings > Config > Archive.'
        );
        return null;
      },
      onArchiveError: setMessage,
    });

  const openCreateForm = () => {
    const blankForm = {
      ...EMPTY_FORM,
      branchIds: branches.map((branch) => branch.id),
    };

    setEditingServiceId(null);
    setForm(blankForm);
    setInitialForm(blankForm);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (service: Service) => {
    const serviceForm = formStateFromService(service);

    setEditingServiceId(service.id);
    setForm(serviceForm);
    setInitialForm(serviceForm);
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setIsConfirmingDiscard(false);
    setEditingServiceId(null);
    setForm(EMPTY_FORM);
    setInitialForm(EMPTY_FORM);
    setFormError(null);
  };

  // Closing by Cancel, the X, Escape or a click outside (never by a
  // successful save, which calls closeForm directly) asks "Discard unsaved
  // changes?" first when the form was edited, so a stray click can't silently
  // throw the edits away. Same pattern as BranchConfigureModal.
  const isFormDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const requestCloseForm = () => {
    if (isFormDirty) {
      setIsConfirmingDiscard(true);
      return;
    }

    closeForm();
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

  /**
   * Applies the form's per-branch prices to a just-created/-updated service,
   * the same way applyBranchSelection applies availability: only branches
   * whose price actually changed are sent. An emptied box clears the
   * branch's own price (null), putting it back on the base price.
   */
  async function applyBranchPrices(
    service: Service,
    branchPrices: Record<string, string>
  ): Promise<Service> {
    if (!accessToken || !canSetBranchPrices) {
      return service;
    }

    const rows = service.service_branch_availability ?? [];
    const changes = branches
      .map((branch) => {
        const typed = (branchPrices[branch.id] ?? '').trim();
        const next = typed === '' ? null : Number(typed);
        const current =
          rows.find((row) => row.branch_id === branch.id)?.price_override ??
          null;

        return { branch, next, changed: next !== current };
      })
      .filter((entry) => entry.changed);

    if (changes.length === 0) {
      return service;
    }

    const results = await Promise.all(
      changes.map(({ branch, next }) =>
        setServiceBranchPrice(service.id, accessToken, {
          branch_id: branch.id,
          price_override: next,
        })
      )
    );

    const updatedRows = [...rows];

    changes.forEach(({ branch }, index) => {
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

    if (
      Object.values(form.branchPrices).some(
        (typed) => typed.trim() !== '' && !(Number(typed) >= 0)
      )
    ) {
      setFormError('A branch price cannot be negative.');
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
        icon: form.icon,
        image_url: form.imageUrl,
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

      const finalService = await applyBranchPrices(
        await applyBranchSelection(result.data, form.branchIds),
        form.branchPrices
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
      icon: form.icon,
      image_url: form.imageUrl,
      ...(form.category !== 'Daycare' ? { base_price: basePrice } : {}),
    };

    const result = await updateService(editingServiceId, accessToken, payload);

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setFormError(result.error ?? 'Could not update the service.');
      return;
    }

    const finalService = await applyBranchPrices(
      await applyBranchSelection(result.data, form.branchIds),
      form.branchPrices
    );

    setIsSubmitting(false);
    replaceService(finalService);
    setMessage('Service updated.');
    closeForm();
  };

  /** The branches charging their own price for a service, shown under its
   * base price - e.g. "Southwoods: PHP 500.00". Nothing when there are none. */
  function renderBranchPrices(service: Service) {
    return (service.service_branch_availability ?? [])
      .filter((row) => row.price_override != null)
      .map((row) => (
        <span key={row.branch_id} className={styles.branchPrice}>
          {branches.find((branch) => branch.id === row.branch_id)?.name ??
            'Branch'}
          : PHP {Number(row.price_override).toFixed(2)}
        </span>
      ));
  }

  function renderServiceBadges(service: Service) {
    return (
      <>
        {!service.requires_assessed_pet ? (
          <span className={styles.categoryBadge}>No assessment required</span>
        ) : null}
        {service.category === 'Grooming' && service.use_pricing_matrix ? (
          <span className={styles.categoryBadge}>Varies by weight/coat</span>
        ) : null}
        {service.min_nights_for_free_package && service.free_package_name ? (
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
            Hotel nightly rate if not picked up
          </span>
        ) : null}
      </>
    );
  }

  function buildServiceActionItems(service: Service): MoreOptionsMenuItem[] {
    return [
      { label: 'Configure', onSelect: () => openEditForm(service) },
      { label: 'Rename', onSelect: () => requestRename(service) },
      { label: 'Archive', onSelect: () => requestArchive(service) },
    ];
  }

  function renderServiceActions(service: Service) {
    return (
      <div className={styles.serviceControls}>
        <MoreOptionsMenu
          label={`Actions for ${service.name}`}
          items={buildServiceActionItems(service)}
        />
      </div>
    );
  }

  const columns: DataTableColumn<Service>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (service) => {
        const Icon = getServiceIcon(service.icon);
        return (
          <span className={styles.serviceMain}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span className={styles.serviceName}>{service.name}</span>
          </span>
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      render: (service) => (
        <span className={styles.categoryBadge}>{service.category}</span>
      ),
    },
    {
      id: 'price',
      header: 'Price',
      render: (service) =>
        service.category !== 'Daycare' ? (
          <span className={styles.servicePrice}>
            PHP {service.base_price.toFixed(2)}
            {renderBranchPrices(service)}
          </span>
        ) : null,
    },
    {
      id: 'details',
      header: 'Details',
      render: (service) => (
        <span className={styles.serviceMain}>
          {renderServiceBadges(service)}
        </span>
      ),
    },
  ];

  // List/Board card - tap-to-hold (CardContextMenu) instead of a
  // persistent "..." button, matching Cages/Staff/Customer Management.
  // Table view keeps the visible tap-to-open button (renderServiceActions
  // above) - only the dense card grid gets the hold gesture.
  function renderServiceCard(service: Service, showMenuButton = false) {
    const Icon = getServiceIcon(service.icon);
    return (
      <CardRowWithMenu
        showMenuButton={showMenuButton}
        label={`Actions for ${service.name}`}
        items={buildServiceActionItems(service)}
      >
        <div className={styles.serviceMain}>
          {Icon ? <Icon size={16} aria-hidden="true" /> : null}
          <span className={styles.serviceName}>{service.name}</span>
          <span className={styles.categoryBadge}>{service.category}</span>
          {service.category !== 'Daycare' ? (
            <span className={styles.servicePrice}>
              PHP {service.base_price.toFixed(2)}
              {renderBranchPrices(service)}
            </span>
          ) : null}
          {renderServiceBadges(service)}
        </div>
      </CardRowWithMenu>
    );
  }

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
          <LoadingState />
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
          <LoadingState label="Loading services..." />
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
          <FilterSortBar
            filterFields={filterFields}
            filterTiles={filterTiles}
            onAddFilter={handleAddFilter}
            onChangeFilter={handleChangeFilter}
            onRemoveFilter={handleRemoveFilter}
            sortFields={SERVICE_SORT_FIELDS}
            sortTile={sortTile}
            onChangeSort={setSortTile}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search services..."
          >
            <div className={styles.filters}>
              <ViewSwitcher
                options={VIEW_OPTIONS}
                value={view}
                onChange={setView}
                ariaLabel="Services view"
              />
              {view === 'board' ? (
                <label className={styles.filterField}>
                  <span className={styles.filterLabel}>Group by</span>
                  <select
                    className={styles.filterSelect}
                    value={groupAxisId}
                    onChange={(event) => setGroupAxisId(event.target.value)}
                    aria-label="Group by"
                  >
                    {SERVICE_GROUP_BY_AXES.map((axis) => (
                      <option key={axis.id} value={axis.id}>
                        {axis.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </FilterSortBar>

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
          onClose={requestCloseForm}
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

              {canSetBranchPrices && form.category !== 'Daycare' ? (
                <fieldset className={styles.branchPrices}>
                  <legend className={styles.fieldLabel}>Branch prices</legend>
                  <p className={styles.fieldHint}>
                    Leave a branch blank to charge the base price there.
                    {form.usePricingMatrix
                      ? ' A branch price replaces the base price only - it does not change the size and coat matrix.'
                      : ''}
                  </p>
                  {branches.map((branch) => (
                    <label key={branch.id} className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {branch.name} price (PHP)
                      </span>
                      <input
                        className={styles.input}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="Same as base price"
                        value={form.branchPrices[branch.id] ?? ''}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            branchPrices: {
                              ...prev.branchPrices,
                              [branch.id]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {form.category === 'Hotel'
                    ? 'Duration per night (minutes)'
                    : form.category === 'Daycare'
                      ? 'Duration per block (minutes)'
                      : 'Average service time (minutes)'}
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
              {form.category !== 'Hotel' && form.category !== 'Daycare' ? (
                <p className={styles.fieldHint}>
                  How long a booking for this service runs. Multiple services
                  add up, and packages sum their services. Leave blank for the
                  60-minute default.
                </p>
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
                      Fallback overnight fee (PHP/night - a pet not picked up
                      before closing is charged the Hotel nightly rate; this is
                      only used if the branch has no Hotel service. Optional,
                      defaults to ₱850)
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

              <IconPicker
                label="Icon"
                value={form.icon}
                onChange={(icon) => setForm((prev) => ({ ...prev, icon }))}
              />

              <ImageUploader
                currentImageUrl={form.imageUrl}
                uploadFn={(file) =>
                  accessToken
                    ? uploadServiceImage(accessToken, file)
                    : Promise.resolve({ data: null, error: 'Not signed in.' })
                }
                onUploaded={(imageUrl) =>
                  setForm((prev) => ({ ...prev, imageUrl }))
                }
                onRemove={() =>
                  setForm((prev) => ({ ...prev, imageUrl: null }))
                }
                alt="Service image"
              />

              <BranchMultiSelect
                label="Available at"
                branches={branches}
                selectedBranchIds={form.branchIds}
                lockedBranchId={lockedBranchId}
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
                  onClick={requestCloseForm}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </Modal>

        {view === 'table' ? (
          <DataTable
            columns={columns}
            rows={filteredServices}
            getRowKey={(service) => service.id}
            renderRowActions={renderServiceActions}
            emptyMessage="No services match the selected filters."
          />
        ) : view === 'list' ? (
          <DataList
            items={filteredServices}
            getRowKey={(service) => service.id}
            renderItem={(service) => (
              <div className={styles.rowContent}>
                {renderServiceCard(service, true)}
              </div>
            )}
            emptyMessage="No services match the selected filters."
          />
        ) : (
          <DataBoard
            groups={groupedServices}
            getRowKey={(service) => service.id}
            renderCard={(service) => (
              <div className={styles.serviceRow}>
                {renderServiceCard(service)}
              </div>
            )}
            emptyColumnMessage="No services here."
          />
        )}
      </div>

      {dialogs}
      <ConfirmDialog
        isOpen={isConfirmingDiscard}
        title="Discard unsaved changes?"
        body="You have changes to this service that haven't been saved. Closing now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={closeForm}
        onCancel={() => setIsConfirmingDiscard(false)}
      />
    </main>
  );
}
