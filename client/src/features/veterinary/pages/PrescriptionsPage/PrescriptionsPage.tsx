import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { DataList } from '../../../../shared/components/DataList/DataList';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { listPrescriptions } from '../../api/veterinary.api';
import {
  applyPrescriptionFilters,
  deriveSortKey,
  matchesPrescriptionQuery,
  MEDICINE_TYPE_GROUP_AXIS,
  PRESCRIPTION_COMPARATORS,
  PRESCRIPTION_FILTER_FIELDS,
  PRESCRIPTION_SORT_FIELDS,
  type PrescriptionRow,
} from './prescriptionBrowserFields';
import styles from './PrescriptionsPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

/** #117: same "every patient" read visibility as the rest of this feature
 * (VETERINARY_READ_ROLES / staffRead) - unlike My Catalog, this isn't
 * owner-scoped. */
const ALLOWED_VIEWER_ROLES = new Set([
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
  'Receptionist',
  'Front Desk',
]);

type ViewMode = 'table' | 'list' | 'board';
const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * #117: "As a developer, perhaps create some sort of dedicated prescription
 * builder... include a search, sort, filter, group by and view options."
 * Read-only, staff-facing - every prescribed medication across every
 * patient, one row per medication.
 */
export function PrescriptionsPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<PrescriptionRow[]>([]);

  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>({
    fieldId: 'date',
    direction: 'desc',
  });
  const [view, setView] = useState<ViewMode>('table');

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      setRoleStatus(
        result.data && ALLOWED_VIEWER_ROLES.has(result.data.role)
          ? 'ok'
          : 'denied'
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    const token = accessToken;
    let isMounted = true;

    void listPrescriptions(token).then(async (result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setIsLoading(false);
        setLoadError(result.error ?? 'Could not load prescriptions.');
        return;
      }

      const petIds = new Set<string>();
      const customerIds = new Set<string>();
      for (const consultation of result.data) {
        if (consultation.booking) {
          petIds.add(consultation.booking.pet_id);
          customerIds.add(consultation.booking.customer_id);
        }
      }

      const [petResults, ownerResults] = await Promise.all([
        Promise.all(Array.from(petIds).map((id) => getPet(id, token))),
        Promise.all(
          Array.from(customerIds).map((id) => getCustomerProfile(id, token))
        ),
      ]);

      if (!isMounted) return;

      const pets: Record<string, Pet> = {};
      for (const petResult of petResults) {
        if (petResult.data) pets[petResult.data.id] = petResult.data;
      }
      const owners: Record<string, CustomerProfile> = {};
      for (const ownerResult of ownerResults) {
        if (ownerResult.data) owners[ownerResult.data.id] = ownerResult.data;
      }

      const flattened: PrescriptionRow[] = [];
      for (const consultation of result.data) {
        const booking = consultation.booking;
        const pet = booking ? pets[booking.pet_id] : undefined;
        const owner = booking ? owners[booking.customer_id] : undefined;
        const date = booking?.completed_at ?? consultation.created_at;

        (consultation.medications ?? []).forEach((medication, index) => {
          flattened.push({
            consultationId: consultation.id,
            medicationIndex: index,
            petName: pet?.name ?? 'Unknown pet',
            ownerName: owner?.full_name ?? 'Unknown owner',
            date,
            name: medication.name,
            dose: medication.dose,
            medicineType: medication.medicine_type ?? '',
            frequency: medication.frequency ?? '',
            duration: medication.duration ?? '',
            notes: medication.notes ?? '',
          });
        });
      }

      setRows(flattened);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken]);

  function handleAddFilter(fieldId: string) {
    const field = PRESCRIPTION_FILTER_FIELDS.find((f) => f.id === fieldId);
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

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? rows.filter((row) => matchesPrescriptionQuery(row, query))
      : rows;
    const filtered = applyPrescriptionFilters(searched, filterTiles);

    return [...filtered].sort(
      PRESCRIPTION_COMPARATORS[deriveSortKey(sortTile)]
    );
  }, [rows, search, filterTiles, sortTile]);

  const groupedRows = useGroupBy(
    visibleRows,
    view === 'board' ? MEDICINE_TYPE_GROUP_AXIS : null
  );

  const columns: DataTableColumn<PrescriptionRow>[] = [
    { id: 'pet', header: 'Pet', render: (row) => row.petName },
    { id: 'owner', header: 'Owner', render: (row) => row.ownerName },
    { id: 'medicine', header: 'Medicine', render: (row) => row.name },
    { id: 'dose', header: 'Dose', render: (row) => row.dose },
    { id: 'type', header: 'Type', render: (row) => row.medicineType || '—' },
    {
      id: 'frequency',
      header: 'Frequency',
      render: (row) => row.frequency || '—',
    },
    {
      id: 'duration',
      header: 'Duration',
      render: (row) => row.duration || '—',
    },
    { id: 'date', header: 'Date', render: (row) => formatDate(row.date) },
  ];

  function renderCard(row: PrescriptionRow) {
    return (
      <div className={styles.rowContent}>
        <div>
          <span className={styles.itemName}>{row.name}</span>
          <p className={styles.itemDescription}>
            {row.petName} · {row.ownerName}
          </p>
        </div>
        {row.dose ? <span className={styles.badge}>{row.dose}</span> : null}
        {row.medicineType ? (
          <span className={styles.badge}>{row.medicineType}</span>
        ) : null}
        {row.frequency ? (
          <span className={styles.badge}>{row.frequency}</span>
        ) : null}
      </div>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load prescriptions.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <LoadingState />
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Prescriptions</h1>
        <p className={styles.copy}>
          Every prescribed medication across every patient, newest first.
        </p>

        {isLoading ? (
          <LoadingState label="Loading prescriptions..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <div className={styles.toolbar}>
              <FilterSortBar
                filterFields={PRESCRIPTION_FILTER_FIELDS}
                filterTiles={filterTiles}
                onAddFilter={handleAddFilter}
                onChangeFilter={handleChangeFilter}
                onRemoveFilter={handleRemoveFilter}
                sortFields={PRESCRIPTION_SORT_FIELDS}
                sortTile={sortTile}
                onChangeSort={setSortTile}
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search prescriptions..."
              >
                <ViewSwitcher
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                />
              </FilterSortBar>
            </div>

            {view === 'table' ? (
              <DataTable
                columns={columns}
                rows={visibleRows}
                getRowKey={(row) =>
                  `${row.consultationId}-${row.medicationIndex}`
                }
                emptyMessage="No prescriptions match these filters."
              />
            ) : view === 'list' ? (
              <DataList
                items={visibleRows}
                getRowKey={(row) =>
                  `${row.consultationId}-${row.medicationIndex}`
                }
                renderItem={renderCard}
                emptyMessage="No prescriptions match these filters."
              />
            ) : (
              <DataBoard
                groups={groupedRows}
                getRowKey={(row) =>
                  `${row.consultationId}-${row.medicationIndex}`
                }
                renderCard={renderCard}
                emptyColumnMessage="No prescriptions here."
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
