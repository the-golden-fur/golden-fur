import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import {
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  getCustomerProfile,
  getPet,
  listPetTypes,
} from '../../../customers/api/customer.api';
import type {
  CustomerProfile,
  Pet,
  PetTypeRow,
} from '../../../customers/customer.types';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import type { MoreOptionsMenuItem } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  getPetConsultationHistory,
  listMyPatients,
} from '../../api/veterinary.api';
import type { Consultation } from '../../veterinary.types';
import { PetHistoryTab } from '../../components/PetHistoryTab/PetHistoryTab';
import { PetPrescriptionsPanel } from '../../components/PetPrescriptionsPanel/PetPrescriptionsPanel';
import {
  applyPatientFilters,
  buildPatientFilterFields,
  derivePatientSortKey,
  matchesPatientQuery,
  type PatientRow,
  PATIENT_COMPARATORS,
  PATIENT_SORT_FIELDS,
} from './myPatientsBrowserFields';
import styles from './MyPatientsPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

/** "My Patients" is a personal roster, unlike the Consultation Queue (which
 * Admin/Supervisor/Superadmin can also view) - only the Veterinarian who
 * owns the data can see it, matching the server's own requester-scoped
 * query (listVeterinarianPatients always filters by the caller's id). */
const ALLOWED_VIEWER_ROLES = new Set(['Veterinarian']);

// Same Table / List switcher the other staff list pages have, plus a Grid of
// patient cards (there is no status to group a Board by here).
type ViewMode = 'table' | 'list' | 'grid';
const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'grid', label: 'Grid', icon: LayoutGrid },
];

/** What the detail panel is showing for the selected patient. */
type PanelTab = 'history' | 'prescriptions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function MyPatientsPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [patients, setPatients] = useState<
    { petId: string; lastVisitAt: string }[]
  >([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petTypeOptions, setPetTypeOptions] = useState<PetTypeRow[]>([]);

  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  // Matches this page's old useSearchAndSort default - patients have always
  // opened sorted by most recent visit, not in raw fetch order.
  const [sortTile, setSortTile] = useState<SortTile | null>({
    fieldId: 'recent',
    direction: 'desc',
  });

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petHistory, setPetHistory] = useState<Consultation[]>([]);
  const [isPetHistoryLoading, setIsPetHistoryLoading] = useState(false);
  const [petHistoryError, setPetHistoryError] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  // Which of the selected patient's two views the detail panel shows.
  const [panelTab, setPanelTab] = useState<PanelTab>('history');
  const [view, setView] = useState<ViewMode>('list');

  // Closes the pet history panel on an outside click or Escape, mirroring
  // MoreOptionsMenu's own dismiss pattern - otherwise the only way back to
  // the "Use the menu on a patient..." placeholder is selecting another
  // patient.
  useEffect(() => {
    if (!selectedPetId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!detailPanelRef.current?.contains(event.target as Node)) {
        setSelectedPetId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedPetId(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPetId]);

  // Pet Types admin CRUD (20260912191): the filter dropdown reads the
  // admin-managed list instead of a hardcoded ['Dog', 'Cat'] array.
  useEffect(() => {
    let isMounted = true;

    void listPetTypes().then((result) => {
      if (isMounted) {
        setPetTypeOptions(result.data ?? []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

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

    void listMyPatients(token).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setIsLoading(false);
        setLoadError(result.error ?? 'Could not load your patients.');
        return;
      }

      setLoadError(null);
      setPatients(
        result.data.map((row) => ({
          petId: row.pet_id,
          lastVisitAt: row.last_visit_at,
        }))
      );
      setIsLoading(false);

      void Promise.all(
        result.data.map((row) => getPet(row.pet_id, token))
      ).then((petResults) => {
        if (!isMounted) return;

        const nextPets: Record<string, Pet> = {};
        for (const petResult of petResults) {
          if (petResult.data) nextPets[petResult.data.id] = petResult.data;
        }
        setPets(nextPets);

        const customerIds = new Set(
          Object.values(nextPets).map((pet) => pet.customer_id)
        );

        void Promise.all(
          Array.from(customerIds).map((id) => getCustomerProfile(id, token))
        ).then((ownerResults) => {
          if (!isMounted) return;

          const nextOwners: Record<string, CustomerProfile> = {};
          for (const ownerResult of ownerResults) {
            if (ownerResult.data)
              nextOwners[ownerResult.data.id] = ownerResult.data;
          }
          setOwners(nextOwners);
        });
      });
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken]);

  const rows = useMemo(() => {
    return patients.map((patient) => {
      const pet = pets[patient.petId];
      const owner = pet ? owners[pet.customer_id] : undefined;

      return {
        petId: patient.petId,
        lastVisitAt: patient.lastVisitAt,
        petName: pet?.name ?? 'Unknown pet',
        ownerName: owner?.full_name ?? 'Unknown owner',
        petType: pet?.pet_type ?? null,
      };
    });
  }, [patients, pets, owners]);

  const patientFilterFields = useMemo(
    () => buildPatientFilterFields(petTypeOptions),
    [petTypeOptions]
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? rows.filter((row) => matchesPatientQuery(row, query))
      : rows;
    const filtered = applyPatientFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      PATIENT_COMPARATORS[derivePatientSortKey(sortTile)]
    );
  }, [rows, search, filterTiles, sortTile]);

  function handleAddFilter(fieldId: string) {
    const field = patientFilterFields.find((f) => f.id === fieldId);
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

  function buildPatientActionItems(row: {
    petId: string;
  }): MoreOptionsMenuItem[] {
    return [
      {
        label: 'View History',
        onSelect: () => selectPatient(row.petId, 'history'),
      },
      {
        label: 'View Prescription',
        onSelect: () => selectPatient(row.petId, 'prescriptions'),
      },
    ];
  }

  const selectedRow = rows.find((row) => row.petId === selectedPetId);

  /** Opens the detail panel on one patient, on the asked-for tab. The
   * history is loaded either way, so switching tabs afterwards is instant. */
  function selectPatient(petId: string, tab: PanelTab) {
    setPanelTab(tab);
    setSelectedPetId(petId);
    setPetHistory([]);
    setPetHistoryError(null);
    setIsPetHistoryLoading(true);

    if (!accessToken) return;

    void getPetConsultationHistory(petId, accessToken).then((result) => {
      setIsPetHistoryLoading(false);

      if (result.error || !result.data) {
        setPetHistoryError(result.error ?? 'Could not load pet history.');
        return;
      }

      setPetHistory(result.data);
    });
  }

  const EMPTY_MESSAGE =
    'No patients match these filters. Patients appear here after you complete a consultation for them.';

  const columns: DataTableColumn<PatientRow>[] = [
    { id: 'pet', header: 'Pet', render: (row) => row.petName },
    { id: 'owner', header: 'Owner', render: (row) => row.ownerName },
    {
      id: 'last-visit',
      header: 'Last visit',
      render: (row) => formatDate(row.lastVisitAt),
    },
  ];

  /** Name, owner and last visit - the List row and the Grid card. */
  function renderPatientSummary(row: PatientRow) {
    return (
      <div
        className={
          row.petId === selectedPetId ? styles.cardActive : styles.card
        }
      >
        <span className={styles.rowPetName}>{row.petName}</span>
        <span className={styles.rowMeta}>{row.ownerName}</span>
        <span className={styles.rowMeta}>
          Last visit: {formatDate(row.lastVisitAt)}
        </span>
      </div>
    );
  }

  /** The two per-patient buttons - the same in every view. */
  function renderPatientActions(row: PatientRow) {
    return (
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.historyButton}
          aria-label={`View history for ${row.petName}`}
          onClick={() => selectPatient(row.petId, 'history')}
        >
          View history
        </button>
        <button
          type="button"
          className={styles.historyButton}
          aria-label={`View prescription for ${row.petName}`}
          onClick={() => selectPatient(row.petId, 'prescriptions')}
        >
          View prescription
        </button>
      </div>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load your patients.
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
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>My Patients</h1>

          <div className={styles.toolbar}>
            <FilterSortBar
              filterFields={patientFilterFields}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={PATIENT_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by pet or owner..."
            >
              <ViewSwitcher
                options={VIEW_OPTIONS}
                value={view}
                onChange={setView}
                ariaLabel="Patient list view"
              />
            </FilterSortBar>
          </div>
        </div>

        {isLoading ? (
          <LoadingState label="Loading patients..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <div className={selectedRow ? styles.layoutWithPanel : styles.layout}>
            <div className={styles.queue}>
              {view === 'table' ? (
                <DataTable
                  columns={columns}
                  rows={visibleRows}
                  getRowKey={(row) => row.petId}
                  renderRowActions={renderPatientActions}
                  emptyMessage={EMPTY_MESSAGE}
                />
              ) : view === 'list' ? (
                <DataList
                  items={visibleRows}
                  getRowKey={(row) => row.petId}
                  emptyMessage={EMPTY_MESSAGE}
                  renderItem={(row) => (
                    <CardContextMenu
                      label={`Actions for ${row.petName}`}
                      items={buildPatientActionItems(row)}
                    >
                      <div className={styles.rowContent}>
                        {renderPatientSummary(row)}
                        {renderPatientActions(row)}
                      </div>
                    </CardContextMenu>
                  )}
                />
              ) : visibleRows.length === 0 ? (
                <p className={styles.copy}>{EMPTY_MESSAGE}</p>
              ) : (
                <ul className={styles.grid}>
                  {visibleRows.map((row) => (
                    <li key={row.petId} className={styles.gridCard}>
                      <CardContextMenu
                        label={`Actions for ${row.petName}`}
                        items={buildPatientActionItems(row)}
                      >
                        <div className={styles.gridCardBody}>
                          {renderPatientSummary(row)}
                          {renderPatientActions(row)}
                        </div>
                      </CardContextMenu>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedRow ? (
              <section
                className={styles.panel}
                ref={detailPanelRef}
                aria-label={`${selectedRow.petName} details`}
              >
                <div className={styles.panelHeader}>
                  <div className={styles.header}>
                    <h2 className={styles.petName}>{selectedRow.petName}</h2>
                    <span className={styles.subtitle}>
                      Owner: {selectedRow.ownerName}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.closeButton}
                    aria-label="Close panel"
                    onClick={() => setSelectedPetId(null)}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <div className={styles.tabs} role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panelTab === 'history'}
                    className={
                      panelTab === 'history' ? styles.tabActive : styles.tab
                    }
                    onClick={() => setPanelTab('history')}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panelTab === 'prescriptions'}
                    className={
                      panelTab === 'prescriptions'
                        ? styles.tabActive
                        : styles.tab
                    }
                    onClick={() => setPanelTab('prescriptions')}
                  >
                    Prescriptions
                  </button>
                </div>

                {panelTab === 'history' ? (
                  <PetHistoryTab
                    consultations={petHistory}
                    isLoading={isPetHistoryLoading}
                    error={petHistoryError}
                  />
                ) : (
                  <PetPrescriptionsPanel
                    key={selectedRow.petId}
                    petId={selectedRow.petId}
                    petName={selectedRow.petName}
                    accessToken={accessToken}
                  />
                )}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
