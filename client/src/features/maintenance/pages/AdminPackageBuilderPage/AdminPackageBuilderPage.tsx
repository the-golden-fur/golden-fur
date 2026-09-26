import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  archivePackage,
  createPackage,
  getPackagePricingConfiguration,
  getPricingConfiguration,
  listBranches,
  listPackages,
  listServices,
  setPackageBranchAvailability,
  updatePackage,
  updatePackagePricingConfiguration,
} from '../../api/maintenance.api';
import {
  ServiceMultiSelect,
  type ServiceMultiSelectOption,
} from '../../components/ServiceMultiSelect/ServiceMultiSelect';
import { PackagePricingPreview } from '../../components/PackagePricingPreview/PackagePricingPreview';
import { PricingMatrixPreview } from '../../components/PricingMatrixPreview/PricingMatrixPreview';
import { deriveBundledPrice } from '../../utils/deriveBundledPrice';
import { formatDuration } from '../../../../shared/utils/formatDuration';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
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
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { BranchAvailabilityModal } from '../../components/BranchAvailabilityModal/BranchAvailabilityModal';
import { BranchMultiSelect } from '../../components/BranchMultiSelect/BranchMultiSelect';
import { IconPicker } from '../../../../shared/components/IconPicker/IconPicker';
import { getServiceIcon } from '../../../../shared/components/IconPicker/serviceIcons';
import { ImageUploader } from '../../../../shared/components/ImageUploader/ImageUploader';
import { uploadServiceImage } from '../../api/maintenance.api';
import {
  SERVICE_CATEGORIES,
  type BranchSummary,
  type Package,
  type PackagePricingConfiguration,
  type PricingConfiguration,
  type Service,
  type ServiceCategory,
} from '../../maintenance.types';
import {
  applyPackageFilters,
  buildPackageFilterFields,
  derivePackageSortKey,
  matchesPackageQuery,
  PACKAGE_COMPARATORS,
  PACKAGE_GROUP_BY_AXES,
  PACKAGE_SORT_FIELDS,
} from './packageBrowserFields';
import styles from './AdminPackageBuilderPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

type ServiceSortKey = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

const SERVICE_SORT_OPTIONS: SortOption<ServiceSortKey>[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'price-asc', label: 'Price (low-high)' },
  { value: 'price-desc', label: 'Price (high-low)' },
];

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function availableBranchIds(pkg: Package): string[] {
  return (pkg.package_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

/** Custom change (unify active/available): mirrors the server's own sync
 * rule (packages.service.ts) so the client's optimistic local update
 * matches what a refetch would show, without a round trip. */
function deriveIsActive(availability: Package['package_branch_availability']) {
  return (availability ?? []).some((row) => row.is_available);
}

export function AdminPackageBuilderPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [packages, setPackages] = useState<Package[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [packagePricingConfiguration, setPackagePricingConfiguration] =
    useState<PackagePricingConfiguration | null>(null);
  // Grooming size/coat rules (#81) - reused here so a matrix-enabled
  // package's own bundled_price can be run through the same rule engine a
  // standalone Grooming service's base_price uses (custom change: package
  // pricing redesign - see resolvePackagePrice in booking.service.ts).
  const [pricingConfiguration, setPricingConfiguration] =
    useState<PricingConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [packageFilterTiles, setPackageFilterTiles] = useState<FilterTile[]>(
    []
  );
  const [packageSortTile, setPackageSortTile] = useState<SortTile | null>(null);
  const [packageSearch, setPackageSearch] = useState('');
  const [packageView, setPackageView] = useState<ViewMode>('table');
  const [packageGroupAxisId, setPackageGroupAxisId] = useState(
    PACKAGE_GROUP_BY_AXES[0].id
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [formName, setFormName] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [discountPercentInput, setDiscountPercentInput] = useState('0');
  const [formUsePricingMatrix, setFormUsePricingMatrix] = useState(false);
  const [formIcon, setFormIcon] = useState<string | null>(null);
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [availabilityPackageId, setAvailabilityPackageId] = useState<
    string | null
  >(null);

  // The service picker's own type filter - narrows which services are
  // offered as pickable options without touching selectedServiceIds (an
  // already-included service that scrolls out of view stays included; see
  // ServiceMultiSelect's own hidden-selection guard). Search/sort for the
  // same list is owned by useSearchAndSort below.
  const [serviceTypeFilter, setServiceTypeFilter] = useState<
    ServiceCategory | 'All'
  >('All');

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
      getPackagePricingConfiguration(accessToken),
      getPricingConfiguration(accessToken),
    ]).then(
      ([
        packagesResult,
        servicesResult,
        branchesResult,
        pricingResult,
        groomingPricingResult,
      ]) => {
        if (!isMounted) {
          return;
        }

        setIsLoading(false);

        if (packagesResult.error || !packagesResult.data) {
          setLoadError(packagesResult.error ?? 'Could not load packages.');
          return;
        }

        if (pricingResult.error || !pricingResult.data) {
          setLoadError(
            pricingResult.error ??
              'Could not load package pricing configuration.'
          );
          return;
        }

        setPackages(packagesResult.data);
        setServices(servicesResult.data ?? []);
        setBranches(branchesResult.data ?? []);
        setPackagePricingConfiguration(pricingResult.data);
        // Optional garnish, same as branch names above - a failed lookup
        // just means the matrix breakdown preview stays hidden, it doesn't
        // block the page.
        setPricingConfiguration(groomingPricingResult.data ?? null);
        // Seeds the bundle discount % input from the singleton config on
        // initial load - set here, not in a reactive effect keyed off
        // packagePricingConfiguration, since maybeSaveDiscountPercent already
        // keeps this input consistent with the config after every save.
        setDiscountPercentInput(
          String(pricingResult.data.bundle_discount_percentage * 100)
        );
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  const packageFilterFields = useMemo(
    () => buildPackageFilterFields(branches),
    [branches]
  );

  const filteredPackages = useMemo(() => {
    const query = packageSearch.trim().toLowerCase();
    const searched = query
      ? packages.filter((pkg) => matchesPackageQuery(pkg, query))
      : packages;
    const filtered = applyPackageFilters(searched, packageFilterTiles);

    if (!packageSortTile) return filtered;
    return [...filtered].sort(
      PACKAGE_COMPARATORS[derivePackageSortKey(packageSortTile)]
    );
  }, [packages, packageSearch, packageFilterTiles, packageSortTile]);

  const activePackageGroupAxis =
    PACKAGE_GROUP_BY_AXES.find((axis) => axis.id === packageGroupAxisId) ??
    null;
  const groupedPackages = useGroupBy(
    filteredPackages,
    packageView === 'board' ? activePackageGroupAxis : null
  );

  function handleAddPackageFilter(fieldId: string) {
    const field = packageFilterFields.find((f) => f.id === fieldId);
    if (!field) return;
    setPackageFilterTiles((prev) => [
      ...prev,
      { fieldId, value: field.defaultValue },
    ]);
  }

  function handleChangePackageFilter(fieldId: string, value: FilterValue) {
    setPackageFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemovePackageFilter(fieldId: string) {
    setPackageFilterTiles((prev) =>
      prev.filter((tile) => tile.fieldId !== fieldId)
    );
  }

  // Only services offered at every one of the form's selected branches are
  // pickable. A member's own weight/coat matrix flag has no bearing on this
  // package (custom change: package pricing redesign - that flag only
  // governs that service when it's booked on its own), so there is no
  // exclusion here beyond branch availability.
  const serviceOptionsForBranches: ServiceMultiSelectOption[] = useMemo(() => {
    if (selectedBranchIds.length === 0) {
      return [];
    }

    return services
      .filter((service) =>
        selectedBranchIds.every((branchId) =>
          (service.service_branch_availability ?? []).some(
            (row) => row.branch_id === branchId && row.is_available
          )
        )
      )
      .map((service) => ({
        id: service.id,
        label: service.name,
        sublabel: `${service.category} - PHP ${service.base_price.toFixed(2)}`,
      }));
  }, [services, selectedBranchIds]);

  const servicePriceById = useMemo(
    () => new Map(services.map((service) => [service.id, service.base_price])),
    [services]
  );

  const serviceComparators = useMemo(
    () => ({
      'name-asc': (a: ServiceMultiSelectOption, b: ServiceMultiSelectOption) =>
        a.label.localeCompare(b.label),
      'name-desc': (a: ServiceMultiSelectOption, b: ServiceMultiSelectOption) =>
        b.label.localeCompare(a.label),
      'price-asc': (a: ServiceMultiSelectOption, b: ServiceMultiSelectOption) =>
        (servicePriceById.get(a.id) ?? 0) - (servicePriceById.get(b.id) ?? 0),
      'price-desc': (
        a: ServiceMultiSelectOption,
        b: ServiceMultiSelectOption
      ) =>
        (servicePriceById.get(b.id) ?? 0) - (servicePriceById.get(a.id) ?? 0),
    }),
    [servicePriceById]
  );

  const {
    search: serviceSearch,
    setSearch: setServiceSearch,
    sortKey: serviceSortKey,
    setSortKey: setServiceSortKey,
    result: searchedServiceOptions,
  } = useSearchAndSort<ServiceMultiSelectOption, ServiceSortKey>({
    items: serviceOptionsForBranches,
    matchesQuery: (option, query) => option.label.toLowerCase().includes(query),
    comparators: serviceComparators,
    initialSortKey: 'name-asc',
  });

  const visibleServiceOptions = useMemo(() => {
    if (serviceTypeFilter === 'All') {
      return searchedServiceOptions;
    }

    const idsInCategory = new Set(
      services
        .filter((service) => service.category === serviceTypeFilter)
        .map((service) => service.id)
    );

    return searchedServiceOptions.filter((option) =>
      idsInCategory.has(option.id)
    );
  }, [searchedServiceOptions, serviceTypeFilter, services]);

  // Derived package length, shown read-only under the service list. Mirrors
  // the server's derivePackageDuration (plain sum of member durations, a
  // null member counted as 0) - packages have no stored duration; a booking
  // that picks this package runs for this long (see Package.
  // total_duration_minutes / booking.service.ts).
  const selectedServiceRows = useMemo(
    () =>
      selectedServiceIds
        .map((serviceId) =>
          services.find((service) => service.id === serviceId)
        )
        .filter((service): service is Service => service !== undefined),
    [selectedServiceIds, services]
  );
  const derivedDurationMinutes = useMemo(
    () =>
      selectedServiceRows.reduce(
        (sum, service) => sum + (service.duration_minutes ?? 0),
        0
      ),
    [selectedServiceRows]
  );
  const servicesMissingDuration = useMemo(
    () =>
      selectedServiceRows.filter((service) => service.duration_minutes === null)
        .length,
    [selectedServiceRows]
  );

  // Same live-preview total PackagePricingPreview shows, computed here too
  // so it can feed the matrix breakdown below (PricingMatrixPreview takes a
  // single basePrice, not a service list).
  const derivedBundledPrice = useMemo(() => {
    if (!packagePricingConfiguration) {
      return 0;
    }

    const basePrices = selectedServiceIds.map(
      (serviceId) =>
        services.find((service) => service.id === serviceId)?.base_price ?? 0
    );

    const parsedPercent = Number(discountPercentInput);
    const hasValidPercent =
      discountPercentInput.trim() !== '' &&
      Number.isFinite(parsedPercent) &&
      parsedPercent >= 0 &&
      parsedPercent <= 100;

    const effectiveConfiguration = hasValidPercent
      ? {
          ...packagePricingConfiguration,
          bundle_discount_percentage: parsedPercent / 100,
        }
      : packagePricingConfiguration;

    return deriveBundledPrice(basePrices, effectiveConfiguration);
  }, [
    selectedServiceIds,
    services,
    packagePricingConfiguration,
    discountPercentInput,
  ]);

  const availabilityPackage = packages.find(
    (pkg) => pkg.id === availabilityPackageId
  );

  const replacePackage = (updated: Package) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.id === updated.id ? updated : pkg))
    );
  };

  function resetFormFields() {
    setSelectedBranchIds([]);
    setFormName('');
    setSelectedServiceIds([]);
    setServiceSearch('');
    setServiceTypeFilter('All');
    setFormUsePricingMatrix(false);
    setFormIcon(null);
    setFormImageUrl(null);
  }

  const openCreateForm = () => {
    // Only clear the form if it was showing a specific existing package -
    // otherwise this resumes whatever "new package" draft was already in
    // progress (see closeForm: dismissing the builder no longer discards
    // it).
    if (editingPackageId !== null) {
      resetFormFields();
    }
    setEditingPackageId(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (pkg: Package) => {
    setEditingPackageId(pkg.id);
    setSelectedBranchIds(availableBranchIds(pkg));
    setFormName(pkg.name);
    setSelectedServiceIds(
      (pkg.package_services ?? []).map((link) => link.service_id)
    );
    setServiceSearch('');
    setServiceTypeFilter('All');
    setFormUsePricingMatrix(pkg.use_pricing_matrix);
    setFormIcon(pkg.icon);
    setFormImageUrl(pkg.image_url);
    setFormError(null);
    setIsFormOpen(true);
  };

  // Dismissing the builder (Cancel, the X button) no longer clears its
  // fields - per UI feedback, an accidental close shouldn't throw away
  // in-progress work. editingPackageId is deliberately left as-is too, so
  // reopening "New package" afterward still recognizes it was mid-edit of an
  // existing package (see openCreateForm) rather than treating stale fields
  // from that package as a fresh draft.
  const closeForm = () => {
    setIsFormOpen(false);
    setFormError(null);
  };

  /** Diffs the form's branch multiselect against a package's current
   * availability and calls setPackageBranchAvailability only for branches
   * whose selection actually changed. */
  async function applyBranchSelection(
    pkg: Package,
    nextSelectedBranchIds: string[]
  ): Promise<Package> {
    if (!accessToken) {
      return pkg;
    }

    const rows = pkg.package_branch_availability ?? [];
    const changedBranches = branches.filter((branch) => {
      const current =
        rows.find((row) => row.branch_id === branch.id)?.is_available ?? false;
      const next = nextSelectedBranchIds.includes(branch.id);
      return current !== next;
    });

    if (changedBranches.length === 0) {
      return pkg;
    }

    const results = await Promise.all(
      changedBranches.map((branch) =>
        setPackageBranchAvailability(pkg.id, accessToken, {
          branch_id: branch.id,
          is_available: nextSelectedBranchIds.includes(branch.id),
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
      ...pkg,
      package_branch_availability: updatedRows,
      is_active: deriveIsActive(updatedRows),
    };
  }

  /** Saves the bundle discount % alongside the package itself, only if it
   * actually changed - this used to be its own independent "Save discount %"
   * action; it's a shared singleton config, not a per-package field, but the
   * form now folds it into the single Save button per the request. */
  async function maybeSaveDiscountPercent(): Promise<string | null> {
    if (!accessToken || !packagePricingConfiguration) {
      return null;
    }

    const percentage = Number(discountPercentInput);

    if (!(percentage >= 0) || percentage > 100) {
      return 'Bundle discount must be between 0 and 100.';
    }

    const nextFraction = percentage / 100;

    if (
      nextFraction === packagePricingConfiguration.bundle_discount_percentage
    ) {
      return null;
    }

    const result = await updatePackagePricingConfiguration(accessToken, {
      bundle_discount_percentage: nextFraction,
    });

    if (result.error || !result.data) {
      return result.error ?? 'Could not update the bundle discount.';
    }

    setPackagePricingConfiguration(result.data);
    return null;
  }

  const handleArchive = async (pkg: Package) => {
    if (!accessToken) {
      return;
    }

    const result = await archivePackage(pkg.id, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setPackages((prev) => prev.filter((item) => item.id !== pkg.id));
    setMessage('Package archived.');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    if (formName.trim() === '') {
      setFormError('A name is required.');
      return;
    }

    if (selectedBranchIds.length === 0) {
      setFormError('Select at least one branch.');
      return;
    }

    if (selectedServiceIds.length < 2) {
      setFormError('A package bundles two or more services.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const discountError = await maybeSaveDiscountPercent();

    if (discountError) {
      setIsSubmitting(false);
      setFormError(discountError);
      return;
    }

    if (editingPackageId === null) {
      const result = await createPackage(accessToken, {
        name: formName.trim(),
        service_ids: selectedServiceIds,
        branch_ids: selectedBranchIds,
        use_pricing_matrix: formUsePricingMatrix,
        icon: formIcon,
        image_url: formImageUrl,
      });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not create the package.');
        return;
      }

      setPackages((prev) => [...prev, result.data as Package]);
      setMessage('Package created.');
      // The draft is now saved - clear it so the next "New package" starts
      // fresh instead of resuming these now-persisted values.
      resetFormFields();
      closeForm();
      return;
    }

    const result = await updatePackage(editingPackageId, accessToken, {
      name: formName.trim(),
      service_ids: selectedServiceIds,
      use_pricing_matrix: formUsePricingMatrix,
      icon: formIcon,
      image_url: formImageUrl,
    });

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setFormError(result.error ?? 'Could not update the package.');
      return;
    }

    const finalPackage = await applyBranchSelection(
      result.data,
      selectedBranchIds
    );

    setIsSubmitting(false);
    replacePackage(finalPackage);
    setMessage('Package updated.');
    closeForm();
  };

  function buildPackageActionItems(pkg: Package): MoreOptionsMenuItem[] {
    return [
      { label: 'Configure', onSelect: () => openEditForm(pkg) },
      {
        label: 'Branch Availability',
        onSelect: () => setAvailabilityPackageId(pkg.id),
      },
      ...(!pkg.is_active
        ? [{ label: 'Archive', onSelect: () => void handleArchive(pkg) }]
        : []),
    ];
  }

  function renderPackageActions(pkg: Package) {
    return (
      <MoreOptionsMenu
        label={`Actions for ${pkg.name}`}
        items={buildPackageActionItems(pkg)}
      />
    );
  }

  function renderPackageBadges(pkg: Package) {
    return (
      <>
        {availableBranchIds(pkg).map((branchId) => (
          <span key={branchId} className={styles.branchBadge}>
            {branchNameById.get(branchId) ?? `Branch ${branchId.slice(0, 8)}`}
          </span>
        ))}
        <span className={styles.packageMeta}>
          {(pkg.package_services ?? []).length} services
        </span>
        {pkg.use_pricing_matrix ? (
          <span className={styles.branchBadge}>Varies by weight/coat</span>
        ) : null}
      </>
    );
  }

  const packageColumns: DataTableColumn<Package>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (pkg) => {
        const Icon = getServiceIcon(pkg.icon);
        return (
          <span className={styles.packageMain}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span className={styles.packageName}>{pkg.name}</span>
          </span>
        );
      },
    },
    {
      id: 'price',
      header: 'Price',
      align: 'end',
      render: (pkg) => (
        <span className={styles.packageMeta}>
          PHP {pkg.bundled_price.toFixed(2)}
        </span>
      ),
    },
    {
      id: 'details',
      header: 'Details',
      render: (pkg) => (
        <span className={styles.packageMain}>{renderPackageBadges(pkg)}</span>
      ),
    },
  ];

  // List/Board card - tap-to-hold (CardContextMenu) instead of a
  // persistent "..." button, matching Cages/Staff/Customer Management.
  // Table view keeps the visible tap-to-open button (renderPackageActions
  // above) - only the dense card grid gets the hold gesture.
  function renderPackageCard(pkg: Package) {
    const Icon = getServiceIcon(pkg.icon);
    return (
      <CardContextMenu
        label={`Actions for ${pkg.name}`}
        items={buildPackageActionItems(pkg)}
      >
        <div className={styles.packageMain}>
          {Icon ? <Icon size={16} aria-hidden="true" /> : null}
          <span className={styles.packageName}>{pkg.name}</span>
          {renderPackageBadges(pkg)}
          <span className={styles.packageMeta}>
            PHP {pkg.bundled_price.toFixed(2)}
          </span>
        </div>
      </CardContextMenu>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the package builder.
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
          <p className={styles.copy}>Loading packages...</p>
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
          <h1 className={styles.title}>Packages</h1>
          <Link
            className={styles.archiveLink}
            to="/staff/admin/archive?tab=packages"
          >
            View archive
          </Link>
        </div>

        <div className={styles.toolbar}>
          <FilterSortBar
            filterFields={packageFilterFields}
            filterTiles={packageFilterTiles}
            onAddFilter={handleAddPackageFilter}
            onChangeFilter={handleChangePackageFilter}
            onRemoveFilter={handleRemovePackageFilter}
            sortFields={PACKAGE_SORT_FIELDS}
            sortTile={packageSortTile}
            onChangeSort={setPackageSortTile}
            searchValue={packageSearch}
            onSearchChange={setPackageSearch}
            searchPlaceholder="Search packages..."
          >
            <div className={styles.filters}>
              <ViewSwitcher
                options={VIEW_OPTIONS}
                value={packageView}
                onChange={setPackageView}
                ariaLabel="Packages view"
              />
              {packageView === 'board' ? (
                <label className={styles.filterField}>
                  <span className={styles.filterLabel}>Group by</span>
                  <select
                    className={styles.filterSelect}
                    value={packageGroupAxisId}
                    onChange={(event) =>
                      setPackageGroupAxisId(event.target.value)
                    }
                    aria-label="Group by"
                  >
                    {PACKAGE_GROUP_BY_AXES.map((axis) => (
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
            New package
          </button>
        </div>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <Modal
          isOpen={isFormOpen}
          title={editingPackageId === null ? 'Build package' : 'Edit package'}
          onClose={closeForm}
          closeOnBackdropClick={false}
        >
          {isFormOpen ? (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Details</h3>
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
              </div>

              <div className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Branches</h3>
                <BranchMultiSelect
                  label="Available at"
                  branches={branches}
                  selectedBranchIds={selectedBranchIds}
                  onChange={setSelectedBranchIds}
                />
              </div>

              <div className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Services</h3>

                {selectedBranchIds.length === 0 ? (
                  <p className={styles.copy}>
                    Select at least one branch to pick its available services.
                  </p>
                ) : (
                  <>
                    <div className={styles.toolbar}>
                      <SearchSortBar
                        searchValue={serviceSearch}
                        onSearchChange={setServiceSearch}
                        searchPlaceholder="Search services..."
                        sortValue={serviceSortKey}
                        onSortChange={setServiceSortKey}
                        sortOptions={SERVICE_SORT_OPTIONS}
                      />
                      <label className={styles.filterField}>
                        <span className={styles.filterLabel}>Service type</span>
                        <select
                          className={styles.filterSelect}
                          value={serviceTypeFilter}
                          onChange={(event) =>
                            setServiceTypeFilter(
                              event.target.value as ServiceCategory | 'All'
                            )
                          }
                        >
                          <option value="All">All service types</option>
                          {SERVICE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <ServiceMultiSelect
                      label="Included services (pick two or more)"
                      options={visibleServiceOptions}
                      selectedIds={selectedServiceIds}
                      onChange={setSelectedServiceIds}
                    />

                    {selectedServiceIds.length > 0 ? (
                      <p className={styles.copy}>
                        Estimated total time:{' '}
                        {formatDuration(derivedDurationMinutes)} (sum of the
                        included services&apos; average times)
                        {servicesMissingDuration > 0
                          ? ` - ${servicesMissingDuration} service${
                              servicesMissingDuration === 1 ? ' has' : 's have'
                            } no time set and count as 0; set it on the Services tab`
                          : ''}
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <div className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Icon &amp; image</h3>
                <IconPicker
                  label="Icon"
                  value={formIcon}
                  onChange={setFormIcon}
                />
                <ImageUploader
                  currentImageUrl={formImageUrl}
                  uploadFn={(file) =>
                    accessToken
                      ? uploadServiceImage(accessToken, file)
                      : Promise.resolve({ data: null, error: 'Not signed in.' })
                  }
                  onUploaded={setFormImageUrl}
                  onRemove={() => setFormImageUrl(null)}
                  alt="Package image"
                />
              </div>

              <div className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Pricing</h3>

                {packagePricingConfiguration ? (
                  <PackagePricingPreview
                    includedServiceBasePrices={selectedServiceIds.map(
                      (serviceId) =>
                        services.find((service) => service.id === serviceId)
                          ?.base_price ?? 0
                    )}
                    configuration={packagePricingConfiguration}
                    discountPercentInput={discountPercentInput}
                    onDiscountPercentInputChange={setDiscountPercentInput}
                  />
                ) : null}

                <ToggleSwitch
                  label="Adjust price by pet size and coat"
                  checked={formUsePricingMatrix}
                  onChange={setFormUsePricingMatrix}
                />
                <p className={styles.copy}>
                  Applies the same size/coat pricing rules used for grooming
                  services to this package&apos;s own price above - not to its
                  individual services.
                </p>

                {formUsePricingMatrix && pricingConfiguration ? (
                  <PricingMatrixPreview
                    basePrice={derivedBundledPrice}
                    configuration={pricingConfiguration}
                  />
                ) : null}
              </div>

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
          ) : null}
        </Modal>

        {packageView === 'table' ? (
          <DataTable
            columns={packageColumns}
            rows={filteredPackages}
            getRowKey={(pkg) => pkg.id}
            renderRowActions={renderPackageActions}
            emptyMessage="No packages match the selected filters."
          />
        ) : packageView === 'list' ? (
          <DataList
            items={filteredPackages}
            getRowKey={(pkg) => pkg.id}
            renderItem={(pkg) => (
              <div className={styles.rowContent}>{renderPackageCard(pkg)}</div>
            )}
            emptyMessage="No packages match the selected filters."
          />
        ) : (
          <DataBoard
            groups={groupedPackages}
            getRowKey={(pkg) => pkg.id}
            renderCard={(pkg) => (
              <div className={styles.packageRow}>{renderPackageCard(pkg)}</div>
            )}
            emptyColumnMessage="No packages here."
          />
        )}
      </div>

      <BranchAvailabilityModal
        isOpen={availabilityPackage !== undefined}
        itemName={availabilityPackage?.name ?? ''}
        rows={branches.map((branch) => ({
          branchId: branch.id,
          branchName: branch.name,
          isAvailable:
            (availabilityPackage?.package_branch_availability ?? []).find(
              (row) => row.branch_id === branch.id
            )?.is_available ?? false,
        }))}
        onToggle={(branchId, isAvailable) => {
          if (!accessToken || !availabilityPackage) {
            return;
          }

          void setPackageBranchAvailability(
            availabilityPackage.id,
            accessToken,
            {
              branch_id: branchId,
              is_available: isAvailable,
            }
          ).then((result) => {
            if (result.error || !result.data || !availabilityPackage) {
              setMessage(
                result.error ?? 'Could not update branch availability.'
              );
              return;
            }

            const rows = availabilityPackage.package_branch_availability ?? [];
            const hasRow = rows.some((row) => row.branch_id === branchId);
            const nextRows = hasRow
              ? rows.map((row) =>
                  row.branch_id === branchId ? { ...row, ...result.data } : row
                )
              : [...rows, result.data];

            replacePackage({
              ...availabilityPackage,
              package_branch_availability: nextRows,
              is_active: deriveIsActive(nextRows),
            });
          });
        }}
        onClose={() => setAvailabilityPackageId(null)}
      />
    </main>
  );
}
