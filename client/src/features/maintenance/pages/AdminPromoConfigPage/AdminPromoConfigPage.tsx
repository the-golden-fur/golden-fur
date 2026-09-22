import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LayoutGrid, List as ListIcon, Table as TableIcon } from 'lucide-react';
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
  setPromoBranchAvailability,
  updatePromo,
  upsertPromoCapConfiguration,
} from '../../api/maintenance.api';
import {
  ServiceMultiSelect,
  type ServiceMultiSelectOption,
} from '../../components/ServiceMultiSelect/ServiceMultiSelect';
import { PromoCard } from '../../components/PromoCard/PromoCard';
import { PromoCapCard } from '../../components/PromoCapCard/PromoCapCard';
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
import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { BranchAvailabilityModal } from '../../components/BranchAvailabilityModal/BranchAvailabilityModal';
import { BranchMultiSelect } from '../../components/BranchMultiSelect/BranchMultiSelect';
import { DayOfWeekPicker } from '../../components/DayOfWeekPicker/DayOfWeekPicker';
import { getPromoTiming } from '../../utils/promoTiming';
import {
  applyPromoFilters,
  buildPromoFilterFields,
  derivePromoSortKey,
  matchesPromoQuery,
  PROMO_COMPARATORS,
  PROMO_SORT_FIELDS,
} from './promoBrowserFields';
import type {
  BranchSummary,
  CapType,
  DiscountValueType,
  Package,
  Promo,
  PromoCapConfiguration,
  PromoScopeInput,
  PromoScopeType,
  PromoType,
  Service,
} from '../../maintenance.types';
import styles from './AdminPromoConfigPage.module.css';

const TIMING_LABELS = {
  Upcoming: 'Upcoming',
  Active: 'Active now',
  Ended: 'Ended',
} as const;

function formatPromoValue(promo: Promo): string {
  return promo.discount_type === 'Percentage'
    ? `${promo.value}% off`
    : `PHP ${promo.value.toFixed(2)} off`;
}

function promoWindowText(promo: Promo): string {
  return promo.condition_note
    ? promo.condition_note
    : promo.start_date && promo.end_date
      ? `${promo.start_date} to ${promo.end_date}`
      : 'No window set';
}

type PromoViewMode = 'gallery' | 'table' | 'list';

const PROMO_VIEW_OPTIONS: ViewSwitcherOption<PromoViewMode>[] = [
  { value: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
];

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DISCOUNT_TYPES: DiscountValueType[] = ['Percentage', 'Flat'];

function availableBranchIds(promo: Promo): string[] {
  return (promo.promo_branch_availability ?? [])
    .filter((row) => row.is_available)
    .map((row) => row.branch_id);
}

type CapSortKey = 'name-asc' | 'name-desc';
type CapTypeFilter = 'all' | CapType;

const CAP_SORT_OPTIONS: SortOption<CapSortKey>[] = [
  { value: 'name-asc', label: 'Branch (A-Z)' },
  { value: 'name-desc', label: 'Branch (Z-A)' },
];

const CAP_TYPE_LABELS: Record<CapType, string> = {
  percentage: 'Percentage',
  flat: 'Flat',
  count: 'Number of promos',
};

const CAP_VALUE_SUFFIX: Record<CapType, string> = {
  percentage: '%',
  flat: ' PHP',
  count: ' promo(s)',
};

interface CapRow {
  branchId: string;
  branchName: string;
  config?: PromoCapConfiguration;
}

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
  // The page has always defaulted to showing only active promos (a status
  // tile pre-added, same as every other filter tile - removable via its
  // hover X to see inactive ones too), unlike the other Tier-1 pages in
  // this rollout which start with no tiles at all.
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([
    { fieldId: 'status', value: 'active' },
  ]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [view, setView] = useState<PromoViewMode>('gallery');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  // Promo builder wizard (session 86): create-only, step 1 picks the type,
  // step 2 shows the (type-conditional) fields below. Editing an existing
  // promo skips straight to 'details' - a promo's type is immutable after
  // creation, so there's no "pick a type first" moment to wizard-ize there.
  const [createStep, setCreateStep] = useState<'type' | 'details'>('type');
  const [formPromoType, setFormPromoType] = useState<PromoType>('date_range');
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([]);
  const [formName, setFormName] = useState('');
  const [formDiscountType, setFormDiscountType] =
    useState<DiscountValueType>('Percentage');
  const [formValue, setFormValue] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formScopeType, setFormScopeType] =
    useState<PromoScopeType>('all_services');
  const [formScopeIds, setFormScopeIds] = useState<string[]>([]);
  const [formBranchIds, setFormBranchIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [availabilityPromoId, setAvailabilityPromoId] = useState<string | null>(
    null
  );

  const [capBranches, setCapBranches] = useState<BranchSummary[]>([]);
  const [capConfigurations, setCapConfigurations] = useState<
    PromoCapConfiguration[]
  >([]);
  const [capLoadError, setCapLoadError] = useState<string | null>(null);
  const [savingCapScopeKey, setSavingCapScopeKey] = useState<string | null>(
    null
  );
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [capTypeFilter, setCapTypeFilter] = useState<CapTypeFilter>('all');
  const [configuringCapBranchId, setConfiguringCapBranchId] = useState<
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
    branchId: string,
    input: { cap_type: CapType; cap_value: number }
  ) => {
    if (!accessToken) {
      return;
    }

    setSavingCapScopeKey(branchId);

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
    setConfiguringCapBranchId(null);
  };

  const capRows: CapRow[] = capBranches.map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    config: capConfigurations.find((config) => config.branch_id === branch.id),
  }));

  const capComparators = useMemo(
    () => ({
      'name-asc': (a: CapRow, b: CapRow) =>
        a.branchName.localeCompare(b.branchName),
      'name-desc': (a: CapRow, b: CapRow) =>
        b.branchName.localeCompare(a.branchName),
    }),
    []
  );

  const {
    search: capSearch,
    setSearch: setCapSearch,
    sortKey: capSortKey,
    setSortKey: setCapSortKey,
    result: sortedCapRows,
  } = useSearchAndSort<CapRow, CapSortKey>({
    items: capRows,
    matchesQuery: (row, query) => row.branchName.toLowerCase().includes(query),
    comparators: capComparators,
    initialSortKey: 'name-asc',
  });

  const filteredCapRows = sortedCapRows.filter(
    (row) => capTypeFilter === 'all' || row.config?.cap_type === capTypeFilter
  );

  const configuringCapRow = capRows.find(
    (row) => row.branchId === configuringCapBranchId
  );

  const availabilityPromo = promos.find(
    (promo) => promo.id === availabilityPromoId
  );

  const promoFilterFields = useMemo(
    () => buildPromoFilterFields(capBranches),
    [capBranches]
  );

  const filteredPromos = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? promos.filter((promo) => matchesPromoQuery(promo, query))
      : promos;
    const filtered = applyPromoFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(PROMO_COMPARATORS[derivePromoSortKey(sortTile)]);
  }, [promos, search, filterTiles, sortTile]);

  function handleAddPromoFilter(fieldId: string) {
    const field = promoFilterFields.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangePromoFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemovePromoFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

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
    setCreateStep('type');
    setFormPromoType('date_range');
    setFormDaysOfWeek([]);
    setFormName('');
    setFormDiscountType('Percentage');
    setFormValue('');
    setFormStartDate('');
    setFormEndDate('');
    setFormScopeType('all_services');
    setFormScopeIds([]);
    setFormBranchIds([]);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (promo: Promo) => {
    setEditingPromoId(promo.id);
    // A promo's type is immutable after creation, so editing always skips
    // straight past the wizard's "pick a type" step.
    setCreateStep('details');
    setFormPromoType(promo.promo_type);
    setFormDaysOfWeek(promo.days_of_week ?? []);
    setFormName(promo.name);
    setFormDiscountType(promo.discount_type);
    setFormValue(String(promo.value));
    setFormStartDate(promo.start_date ?? '');
    setFormEndDate(promo.end_date ?? '');
    setFormScopeType(promo.scope_type);
    setFormScopeIds(scopeToCompositeIds(promo));
    setFormBranchIds(availableBranchIds(promo));
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPromoId(null);
    setCreateStep('type');
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

  const handleBranchToggle = async (
    promo: Promo,
    branchId: string,
    isAvailable: boolean
  ) => {
    if (!accessToken) {
      return;
    }

    const result = await setPromoBranchAvailability(promo.id, accessToken, {
      branch_id: branchId,
      is_available: isAvailable,
    });

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update branch availability.');
      return;
    }

    const rows = promo.promo_branch_availability ?? [];
    const hasRow = rows.some((row) => row.branch_id === branchId);

    replacePromo({
      ...promo,
      promo_branch_availability: hasRow
        ? rows.map((row) =>
            row.branch_id === branchId ? { ...row, ...result.data } : row
          )
        : [...rows, result.data],
    });
  };

  /**
   * Applies the edit form's branch multiselect to a just-updated promo by
   * diffing it against the row's current availability and only calling
   * setPromoBranchAvailability for branches whose selection actually
   * changed - same approach as AdminServicesPage/AdminDiscountManagementPage's
   * own applyBranchSelection. Create doesn't need this: branch_ids goes
   * straight into the create payload and the server seeds the availability
   * rows itself.
   */
  async function applyBranchSelection(
    promo: Promo,
    selectedBranchIds: string[]
  ): Promise<Promo> {
    if (!accessToken) {
      return promo;
    }

    const rows = promo.promo_branch_availability ?? [];
    const changedBranches = capBranches.filter((branch) => {
      const current =
        rows.find((row) => row.branch_id === branch.id)?.is_available ?? false;
      const next = selectedBranchIds.includes(branch.id);
      return current !== next;
    });

    if (changedBranches.length === 0) {
      return promo;
    }

    const results = await Promise.all(
      changedBranches.map((branch) =>
        setPromoBranchAvailability(promo.id, accessToken, {
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

    return { ...promo, promo_branch_availability: updatedRows };
  }

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

  function buildPromoActionItems(promo: Promo): MoreOptionsMenuItem[] {
    return [
      { label: 'Edit', onSelect: () => openEditForm(promo) },
      {
        label: 'Branch Availability',
        onSelect: () => setAvailabilityPromoId(promo.id),
      },
      ...(!promo.is_active
        ? [
            {
              label: 'Archive',
              onSelect: () => void handleArchive(promo),
            },
          ]
        : []),
    ];
  }

  function renderPromoActions(promo: Promo) {
    return (
      <div className={styles.rowActions}>
        <ToggleSwitch
          label={`${promo.is_active ? 'Disable' : 'Enable'} ${promo.name}`}
          checked={promo.is_active}
          onChange={(isActive) => void handleActiveToggle(promo, isActive)}
        />
        <MoreOptionsMenu
          label={`Actions for ${promo.name}`}
          items={buildPromoActionItems(promo)}
        />
      </div>
    );
  }

  // List card (no Board view on this page) - tap-to-hold (CardContextMenu)
  // instead of a persistent "..." button, matching Cages/Staff/Customer
  // Management. Table view keeps the visible tap-to-open button
  // (renderPromoActions above) - only the dense card list gets the hold
  // gesture. The ToggleSwitch is a direct control, not a menu item, so it
  // stays visible inside the card (a plain tap still reaches it - see
  // CardContextMenu's own doc comment).
  function renderPromoCard(promo: Promo) {
    return (
      <CardContextMenu
        label={`Actions for ${promo.name}`}
        items={buildPromoActionItems(promo)}
      >
        <div className={styles.rowContent}>
          <div className={styles.itemMain}>
            <span className={styles.itemName}>{promo.name}</span>
            <StatusBadge isActive={promo.is_active} />
            <span className={styles.timingBadge}>
              {TIMING_LABELS[getPromoTiming(promo)]}
            </span>
            <span className={styles.copy}>{formatPromoValue(promo)}</span>
            <span className={styles.copy}>{promoWindowText(promo)}</span>
          </div>
          <div className={styles.rowActions}>
            <ToggleSwitch
              label={`${promo.is_active ? 'Disable' : 'Enable'} ${promo.name}`}
              checked={promo.is_active}
              onChange={(isActive) =>
                void handleActiveToggle(promo, isActive)
              }
            />
          </div>
        </div>
      </CardContextMenu>
    );
  }

  const promoTableColumns: DataTableColumn<Promo>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (promo) => <span className={styles.itemName}>{promo.name}</span>,
    },
    {
      id: 'timing',
      header: 'Timing',
      render: (promo) => TIMING_LABELS[getPromoTiming(promo)],
    },
    {
      id: 'value',
      header: 'Value',
      render: (promo) => formatPromoValue(promo),
    },
    {
      id: 'window',
      header: 'Window',
      render: (promo) => promoWindowText(promo),
    },
    {
      id: 'status',
      header: 'Status',
      render: (promo) => <StatusBadge isActive={promo.is_active} />,
    },
  ];

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

    if (formPromoType === 'date_range') {
      if (formStartDate === '' || formEndDate === '') {
        setFormError('A promo needs both a start and end date.');
        return;
      }
    } else if (formDaysOfWeek.length === 0) {
      setFormError('Select at least one day of the week.');
      return;
    }

    if (formScopeType === 'specific' && formScopeIds.length === 0) {
      setFormError('Select at least one service or package for this scope.');
      return;
    }

    if (formBranchIds.length === 0) {
      setFormError('Select at least one branch.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const scope =
      formScopeType === 'specific' ? compositeIdsToScope(formScopeIds) : [];

    if (editingPromoId === null) {
      const result = await createPromo(accessToken, {
        name: formName.trim(),
        promo_type: formPromoType,
        ...(formPromoType === 'weekly_recurring'
          ? {
              days_of_week: formDaysOfWeek,
              // Optional overall campaign window on top of the day match -
              // only sent if the admin actually filled them in.
              ...(formStartDate ? { start_date: formStartDate } : {}),
              ...(formEndDate ? { end_date: formEndDate } : {}),
            }
          : { start_date: formStartDate, end_date: formEndDate }),
        discount_type: formDiscountType,
        value,
        scope_type: formScopeType,
        ...(formScopeType === 'specific' ? { scope } : {}),
        branch_ids: formBranchIds,
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
      ...(formPromoType === 'weekly_recurring'
        ? {
            days_of_week: formDaysOfWeek,
            start_date: formStartDate || null,
            end_date: formEndDate || null,
          }
        : { start_date: formStartDate, end_date: formEndDate }),
      // Clears any legacy condition-based window this promo may have had -
      // the create/edit form is date-range/weekly-recurring only now, so
      // neither can coexist with it (the server rejects a promo that's both
      // anyway).
      condition_note: null,
      discount_type: formDiscountType,
      value,
      scope_type: formScopeType,
      scope,
    });

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setFormError(result.error ?? 'Could not update the promo.');
      return;
    }

    const finalPromo = await applyBranchSelection(result.data, formBranchIds);

    setIsSubmitting(false);
    replacePromo(finalPromo);
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
          <FilterSortBar
            filterFields={promoFilterFields}
            filterTiles={filterTiles}
            onAddFilter={handleAddPromoFilter}
            onChangeFilter={handleChangePromoFilter}
            onRemoveFilter={handleRemovePromoFilter}
            sortFields={PROMO_SORT_FIELDS}
            sortTile={sortTile}
            onChangeSort={setSortTile}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search promos..."
          >
            <ViewSwitcher
              options={PROMO_VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Promos view"
            />
          </FilterSortBar>

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

        <Modal
          isOpen={isFormOpen}
          title={editingPromoId === null ? 'Create promo' : 'Edit promo'}
          onClose={closeForm}
        >
          {editingPromoId === null && createStep === 'type' ? (
            // Promo builder wizard, step 1 (session 86): pick the type
            // before any of the shared/type-specific fields appear. A
            // promo's type can't be changed after creation, so this is
            // the only moment it's ever chosen.
            <div className={styles.form}>
              <fieldset className={styles.field}>
                <legend className={styles.fieldLabel}>Promo type</legend>
                <label>
                  <input
                    type="radio"
                    name="promo-type"
                    checked={formPromoType === 'date_range'}
                    onChange={() => setFormPromoType('date_range')}
                  />{' '}
                  Date range - active between a start and end date
                </label>
                <br />
                <label>
                  <input
                    type="radio"
                    name="promo-type"
                    checked={formPromoType === 'weekly_recurring'}
                    onChange={() => setFormPromoType('weekly_recurring')}
                  />{' '}
                  Weekly recurring - active on chosen days of the week
                </label>
              </fieldset>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setCreateStep('details')}
                >
                  Next
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={closeForm}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              {editingPromoId === null ? (
                <p className={styles.copy}>
                  {formPromoType === 'date_range'
                    ? 'Date range promo'
                    : 'Weekly recurring promo'}{' '}
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setCreateStep('type')}
                  >
                    Change type
                  </button>
                </p>
              ) : null}

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

              {formPromoType === 'date_range' ? (
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
                <>
                  <DayOfWeekPicker
                    label="Days of the week"
                    selectedDays={formDaysOfWeek}
                    onChange={setFormDaysOfWeek}
                  />
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Start date (optional - limits the overall campaign window)
                    </span>
                    <input
                      className={styles.input}
                      type="date"
                      value={formStartDate}
                      onChange={(event) => setFormStartDate(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      End date (optional)
                    </span>
                    <input
                      className={styles.input}
                      type="date"
                      value={formEndDate}
                      onChange={(event) => setFormEndDate(event.target.value)}
                    />
                  </label>
                </>
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

              <BranchMultiSelect
                label="Available at"
                branches={capBranches}
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
          )}
        </Modal>

        {filteredPromos.length === 0 ? (
          <p className={styles.copy}>No promos match the selected filters.</p>
        ) : view === 'table' ? (
          <DataTable
            columns={promoTableColumns}
            rows={filteredPromos}
            getRowKey={(promo) => promo.id}
            renderRowActions={renderPromoActions}
          />
        ) : view === 'list' ? (
          <DataList
            items={filteredPromos}
            getRowKey={(promo) => promo.id}
            renderItem={renderPromoCard}
          />
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
                onManageBranches={() => setAvailabilityPromoId(promo.id)}
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
            Maximum total discount value (or number of promos) that all
            combined, customer-activated promos may contribute to one
            transaction. Each branch has its own cap, viewed and saved
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
            <>
              <div className={styles.toolbar}>
                <SearchSortBar
                  searchValue={capSearch}
                  onSearchChange={setCapSearch}
                  searchPlaceholder="Search branches..."
                  sortValue={capSortKey}
                  onSortChange={setCapSortKey}
                  sortOptions={CAP_SORT_OPTIONS}
                />
                <label className={styles.filterField}>
                  <span className={styles.filterLabel}>Cap type</span>
                  <select
                    className={styles.filterSelect}
                    value={capTypeFilter}
                    onChange={(event) =>
                      setCapTypeFilter(event.target.value as CapTypeFilter)
                    }
                  >
                    <option value="all">All</option>
                    {(['percentage', 'flat', 'count'] as CapType[]).map(
                      (type) => (
                        <option key={type} value={type}>
                          {CAP_TYPE_LABELS[type]}
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              {filteredCapRows.length === 0 ? (
                <p className={styles.copy}>
                  No branches match the selected filters.
                </p>
              ) : (
                <ul className={styles.capList}>
                  {filteredCapRows.map((row) => (
                    <li key={row.branchId} className={styles.capRow}>
                      <div className={styles.capRowMain}>
                        <span className={styles.capBranchName}>
                          {row.branchName}
                        </span>
                        {row.config ? (
                          <span className={styles.categoryBadge}>
                            {CAP_TYPE_LABELS[row.config.cap_type]} -{' '}
                            {row.config.cap_value}
                            {CAP_VALUE_SUFFIX[row.config.cap_type]}
                          </span>
                        ) : (
                          <span className={styles.capRowNote}>
                            No cap saved yet
                          </span>
                        )}
                      </div>
                      <MoreOptionsMenu
                        label={`Actions for ${row.branchName}`}
                        items={[
                          {
                            label: 'Configure',
                            onSelect: () =>
                              setConfiguringCapBranchId(row.branchId),
                          },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <Modal
        isOpen={configuringCapRow !== undefined}
        title={`Promo Cap - ${configuringCapRow?.branchName ?? ''}`}
        onClose={() => setConfiguringCapBranchId(null)}
      >
        {configuringCapRow ? (
          <PromoCapCard
            key={`${configuringCapRow.branchId}-${configuringCapRow.config?.id ?? 'unsaved'}`}
            config={configuringCapRow.config}
            onSave={(input) =>
              void handleSaveCap(configuringCapRow.branchId, input)
            }
            isSaving={savingCapScopeKey === configuringCapRow.branchId}
          />
        ) : null}
      </Modal>

      <BranchAvailabilityModal
        isOpen={availabilityPromo !== undefined}
        itemName={availabilityPromo?.name ?? ''}
        rows={capBranches.map((branch) => ({
          branchId: branch.id,
          branchName: branch.name,
          isAvailable:
            (availabilityPromo?.promo_branch_availability ?? []).find(
              (row) => row.branch_id === branch.id
            )?.is_available ?? false,
        }))}
        onToggle={(branchId, isAvailable) => {
          if (availabilityPromo) {
            void handleBranchToggle(availabilityPromo, branchId, isAvailable);
          }
        }}
        onClose={() => setAvailabilityPromoId(null)}
      />
    </main>
  );
}
