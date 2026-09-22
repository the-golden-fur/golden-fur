import { useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { ThemeContext } from '../../../../shared/providers/ThemeProvider/themeContext';
import { formatWeight } from '../../../../shared/utils/petWeight';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import { getStaffProfile } from '../../../staff/api/staff.api';
import type { BookingStatus } from '../../../booking/booking.types';
import { BookingStatusBadge } from '../../../booking/components/shared/BookingStatusBadge/BookingStatusBadge';
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
import {
  useGroupBy,
  type GroupByAxis,
} from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  listConsultationQueue,
  updateConsultation,
} from '../../api/veterinary.api';
import type {
  Consultation,
  MedicationInput,
  ProcedureInput,
} from '../../veterinary.types';
import { ConsultationDetailPanel } from './ConsultationDetailPanel';
import {
  CONSULTATION_QUEUE_FILTER_FIELDS,
  CONSULTATION_QUEUE_SORT_FIELDS,
  CONSULTATION_STATUS_GROUPS,
  deriveDateRange,
  deriveStatusFilter,
} from './consultationQueueFilterFields';
import styles from './VeterinaryConsolePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

type StatusFilter = BookingStatus | 'All';

type SortKey = 'time' | 'pet-name';

type ViewMode = 'table' | 'list' | 'board';
const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

// Issue #70 AC-1/AC-4: no WebSocket/realtime infra exists anywhere in this
// codebase yet (same gap noted in GroomerDashboardPage's own #68 dev note),
// so the queue and the "follow-up scheduled" state both refresh via polling.
const REFRESH_INTERVAL_MS = 15_000;

function formatScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function VeterinaryConsolePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const { weightUnit } = useContext(ThemeContext);

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [staffRole, setStaffRole] = useState<string | null>(null);

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  // Pre-seeded with the Date tile so the queue still defaults to Today -
  // removing that tile (like any other) is then a deliberate "every date"
  // choice, not the default. No Status tile by default = every status
  // (deriveStatusFilter's own 'All').
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([
    { fieldId: 'date', value: { preset: 'today', from: null, to: null } },
  ]);
  const [view, setView] = useState<ViewMode>('list');
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingStartId, setPendingStartId] = useState<string | null>(null);
  const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);

  const dateRange = useMemo(() => deriveDateRange(filterTiles), [filterTiles]);
  const statusFilter: StatusFilter = deriveStatusFilter(filterTiles);

  function handleAddFilter(fieldId: string) {
    const field = CONSULTATION_QUEUE_FILTER_FIELDS.find(
      (f) => f.id === fieldId
    );
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

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setStaffRole(result.data.role);
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    // Narrowed once here since a nested function declaration (unlike an
    // inline callback) loses the enclosing `!accessToken` narrowing.
    const token = accessToken;
    let isMounted = true;

    function handleQueueResult(
      result: Awaited<ReturnType<typeof listConsultationQueue>>
    ) {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setIsLoading(false);
        setLoadError(result.error ?? 'Could not load the consultation queue.');
        return;
      }

      setLoadError(null);
      setConsultations(result.data.consultations);
      setIsLoading(false);

      const petIds = new Set<string>();
      const customerIds = new Set<string>();

      for (const consultation of result.data.consultations) {
        if (consultation.booking) {
          petIds.add(consultation.booking.pet_id);
          customerIds.add(consultation.booking.customer_id);
        }
      }

      void Promise.all(Array.from(petIds).map((id) => getPet(id, token))).then(
        (petResults) => {
          if (!isMounted) return;
          setPets((prev) => {
            const next = { ...prev };
            for (const petResult of petResults) {
              if (petResult.data) next[petResult.data.id] = petResult.data;
            }
            return next;
          });
        }
      );

      void Promise.all(
        Array.from(customerIds).map((id) => getCustomerProfile(id, token))
      ).then((ownerResults) => {
        if (!isMounted) return;
        setOwners((prev) => {
          const next = { ...prev };
          for (const ownerResult of ownerResults) {
            if (ownerResult.data) next[ownerResult.data.id] = ownerResult.data;
          }
          return next;
        });
      });
    }

    const queueDateRange = {
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    };

    void listConsultationQueue(token, queueDateRange).then(handleQueueResult);

    const interval = setInterval(() => {
      void listConsultationQueue(token, queueDateRange).then(handleQueueResult);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roleStatus, accessToken, dateRange.from, dateRange.to]);

  const rows = useMemo(() => {
    return consultations.map((consultation) => {
      const booking = consultation.booking;
      const pet = booking ? pets[booking.pet_id] : undefined;
      const owner = booking ? owners[booking.customer_id] : undefined;

      return {
        consultation,
        petName: pet?.name ?? 'Unknown pet',
        ownerName: owner?.full_name ?? 'Unknown owner',
        scheduledStart: booking?.scheduled_start ?? consultation.created_at,
      };
    });
  }, [consultations, pets, owners]);

  type QueueRow = (typeof rows)[number];

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'All') return rows;
    return rows.filter(
      (row) => row.consultation.booking?.status === statusFilter
    );
  }, [rows, statusFilter]);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: visibleRows,
  } = useSearchAndSort<QueueRow, SortKey>({
    items: statusFiltered,
    matchesQuery: (row, query) =>
      row.petName.toLowerCase().includes(query) ||
      row.ownerName.toLowerCase().includes(query),
    comparators: {
      time: (a, b) =>
        new Date(a.scheduledStart).getTime() -
        new Date(b.scheduledStart).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'time',
  });

  // FilterSortBar's Sort control always shows a direction per field, but
  // this page only ever offers one direction each (earliest / A-Z) - the
  // tile is just a presentation of useSearchAndSort's own sortKey, not a
  // second, independent piece of state. "Clear sort" reverts to the
  // default rather than a true no-sort state, since an unordered queue
  // would be confusing.
  const sortTile: SortTile = {
    fieldId: sortKey,
    direction: sortKey === 'time' ? 'earliest' : 'az',
  };

  function handleChangeSort(tile: SortTile | null) {
    setSortKey(tile ? (tile.fieldId as SortKey) : 'time');
  }

  // Board view's columns - Pending/In Progress/Completed, the same three
  // groups the queue already limits itself to server-side. Fixed (not a
  // page-picked axis, unlike e.g. Breeds' pet-type grouping) since status
  // is the only grouping that makes sense for a queue.
  const STATUS_GROUP_AXIS: GroupByAxis<QueueRow> = {
    id: 'status',
    label: 'Status',
    columns: CONSULTATION_STATUS_GROUPS,
    columnFor: (row) => row.consultation.booking?.status ?? 'Pending',
  };

  const groupedRows = useGroupBy(
    visibleRows,
    view === 'board' ? STATUS_GROUP_AXIS : null
  );

  const selectedRow = rows.find((row) => row.consultation.id === selectedId);
  const pendingStartRow = rows.find(
    (row) => row.consultation.id === pendingStartId
  );
  const viewDetailsRow = rows.find(
    (row) => row.consultation.id === viewDetailsId
  );

  // Mirrors the server's VETERINARY_WRITE_ROLES (veterinary.types.ts) - Admin
  // /Supervisor/Superadmin can view the console but any write PATCH/POST
  // gets a 403, so those controls must be disabled here too.
  const canWrite = staffRole === 'Veterinarian';

  function selectConsultation(id: string) {
    setSelectedId(id);
    setSaveError(null);
  }

  // Both the queue row's own quick-start button and the detail panel's
  // "Start Consultation" button route through here, so there's exactly one
  // confirmation modal regardless of which one was clicked.
  function requestStart(consultationId: string) {
    selectConsultation(consultationId);
    setPendingStartId(consultationId);
  }

  async function handleStart(consultationId: string) {
    if (!accessToken) return;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(consultationId, accessToken, {
      status: 'Ongoing',
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not start this consultation.');
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
      )
    );
  }

  async function handleComplete(fields: {
    temperature?: number;
    weight?: number;
    heart_rate?: number;
    respiratory_rate?: number;
    diagnosis?: string;
    medications: MedicationInput[];
    procedures: ProcedureInput[];
    professionalFee: number;
    vaccination?: {
      vaccine_name: string;
      date_administered: string;
      next_due_date?: string;
      notes?: string;
    };
  }) {
    if (!accessToken || !selectedRow) return;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(
      selectedRow.consultation.id,
      accessToken,
      {
        status: 'Completed',
        temperature: fields.temperature,
        weight: fields.weight,
        heart_rate: fields.heart_rate,
        respiratory_rate: fields.respiratory_rate,
        diagnosis: fields.diagnosis,
        medications: fields.medications,
        procedures: fields.procedures,
        professional_fee: fields.professionalFee,
        vaccination: fields.vaccination,
      }
    );

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not complete this consultation.');
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
      )
    );
  }

  const columns: DataTableColumn<QueueRow>[] = [
    {
      id: 'pet',
      header: 'Pet',
      render: (row) => (
        <button
          type="button"
          className={
            row.consultation.id === selectedId
              ? styles.petNameButtonActive
              : styles.petNameButton
          }
          onClick={() => selectConsultation(row.consultation.id)}
        >
          {row.petName}
        </button>
      ),
    },
    { id: 'owner', header: 'Owner', render: (row) => row.ownerName },
    {
      id: 'time',
      header: 'Scheduled',
      render: (row) => formatScheduledTime(row.scheduledStart),
    },
    {
      id: 'status',
      header: 'Status',
      render: (row) =>
        row.consultation.booking?.status ? (
          <BookingStatusBadge status={row.consultation.booking.status} />
        ) : (
          '—'
        ),
    },
  ];

  function renderRowActions(row: QueueRow) {
    const rowBookingStatus = row.consultation.booking?.status;
    return (
      <div className={styles.rowActions}>
        {canWrite && rowBookingStatus === 'Pending' ? (
          <button
            type="button"
            className={styles.startButton}
            disabled={isSaving}
            onClick={() => requestStart(row.consultation.id)}
          >
            Start Consultation
          </button>
        ) : null}
        <MoreOptionsMenu
          label={`Options for ${row.petName}`}
          items={[
            {
              label: 'View Details',
              onSelect: () => setViewDetailsId(row.consultation.id),
            },
          ]}
        />
      </div>
    );
  }

  // List/Board card - tap still selects the consultation (CardContextMenu
  // deliberately leaves a plain tap alone so it still reaches this), a
  // long-press (touch) or right-click (desktop) opens View Details instead
  // of a persistent "..." button sitting on every card in the grid.
  function renderQueueCard(row: QueueRow) {
    const rowBookingStatus = row.consultation.booking?.status;

    return (
      <CardContextMenu
        label={`Options for ${row.petName}`}
        items={[
          {
            label: 'View Details',
            onSelect: () => setViewDetailsId(row.consultation.id),
          },
        ]}
      >
        <div
          className={
            row.consultation.id === selectedId
              ? styles.rowItemActive
              : styles.rowItem
          }
        >
          <button
            type="button"
            className={styles.rowButton}
            onClick={() => selectConsultation(row.consultation.id)}
          >
            <div className={styles.rowHeader}>
              <span className={styles.rowPetName}>{row.petName}</span>
              {rowBookingStatus ? (
                <BookingStatusBadge status={rowBookingStatus} />
              ) : null}
            </div>
            <span className={styles.rowMeta}>Owner: {row.ownerName}</span>
            <span className={styles.rowMeta}>
              {formatScheduledTime(row.scheduledStart)}
            </span>
          </button>
          {canWrite && rowBookingStatus === 'Pending' ? (
            <button
              type="button"
              className={styles.startButton}
              disabled={isSaving}
              onClick={() => requestStart(row.consultation.id)}
            >
              Start Consultation
            </button>
          ) : null}
        </div>
      </CardContextMenu>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the veterinary console.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
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
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Veterinary Console</h1>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() =>
                navigate('/staff/bookings/new', {
                  state: { lockedServiceCategory: 'Veterinary' },
                })
              }
            >
              New Consultation
            </button>
          </div>

          <div className={styles.filterBarRow}>
            <FilterSortBar
              filterFields={CONSULTATION_QUEUE_FILTER_FIELDS}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={CONSULTATION_QUEUE_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={handleChangeSort}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by pet or owner..."
            >
              <ViewSwitcher
                options={VIEW_OPTIONS}
                value={view}
                onChange={setView}
                ariaLabel="Consultation queue view"
              />
            </FilterSortBar>
          </div>
        </div>

        {isLoading ? (
          <p className={styles.copy}>Loading consultations...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <div className={styles.layout}>
            <div className={styles.queue}>
              {view === 'table' ? (
                <DataTable
                  columns={columns}
                  rows={visibleRows}
                  getRowKey={(row) => row.consultation.id}
                  renderRowActions={renderRowActions}
                  emptyMessage="No consultations match these filters."
                />
              ) : view === 'list' ? (
                <DataList
                  items={visibleRows}
                  getRowKey={(row) => row.consultation.id}
                  renderItem={renderQueueCard}
                  emptyMessage="No consultations match these filters."
                />
              ) : (
                <DataBoard
                  groups={groupedRows}
                  getRowKey={(row) => row.consultation.id}
                  renderCard={renderQueueCard}
                  emptyColumnMessage="No consultations here."
                />
              )}
            </div>

            <div className={styles.detail}>
              {selectedRow ? (
                <ConsultationDetailPanel
                  key={selectedRow.consultation.id}
                  consultation={selectedRow.consultation}
                  petName={selectedRow.petName}
                  ownerName={selectedRow.ownerName}
                  accessToken={accessToken}
                  canWrite={canWrite}
                  isSaving={isSaving}
                  saveError={saveError}
                  onStart={() => requestStart(selectedRow.consultation.id)}
                  onComplete={(fields) => void handleComplete(fields)}
                />
              ) : (
                <p className={styles.copy}>Select a consultation to begin.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={pendingStartId !== null}
        title="Start Consultation"
        onClose={() => setPendingStartId(null)}
      >
        <p className={styles.copy}>
          Start this consultation for {pendingStartRow?.petName ?? 'this pet'}?
          This moves the booking to In Progress.
        </p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.startButton}
            disabled={isSaving}
            onClick={() => {
              if (!pendingStartId) return;
              const id = pendingStartId;
              setPendingStartId(null);
              void handleStart(id);
            }}
          >
            {isSaving ? 'Starting...' : 'Start Consultation'}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => setPendingStartId(null)}
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={viewDetailsRow !== undefined}
        title="Consultation Details"
        onClose={() => setViewDetailsId(null)}
      >
        {viewDetailsRow ? (
          <div className={styles.viewDetailsBody}>
            <div className={styles.viewDetailsHeader}>
              <div>
                <h3 className={styles.viewDetailsName}>
                  {viewDetailsRow.petName}
                </h3>
                <span className={styles.copy}>
                  Owner: {viewDetailsRow.ownerName}
                </span>
              </div>
              {viewDetailsRow.consultation.booking?.status ? (
                <BookingStatusBadge
                  status={viewDetailsRow.consultation.booking.status}
                />
              ) : null}
            </div>

            <p className={styles.copy}>
              Reason: {viewDetailsRow.consultation.reason_for_visit}
            </p>

            <div className={styles.viewDetailsGrid}>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Temperature</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.temperature ?? '—'}
                </span>
              </div>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Weight</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.weight != null
                    ? formatWeight(
                        viewDetailsRow.consultation.weight,
                        weightUnit
                      )
                    : '—'}
                </span>
              </div>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Heart Rate</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.heart_rate ?? '—'}
                </span>
              </div>
              <div className={styles.detailField}>
                <span className={styles.detailLabel}>Respiratory Rate</span>
                <span className={styles.detailValue}>
                  {viewDetailsRow.consultation.respiratory_rate ?? '—'}
                </span>
              </div>
            </div>

            <div className={styles.detailField}>
              <span className={styles.detailLabel}>Diagnosis</span>
              <span className={styles.detailValue}>
                {viewDetailsRow.consultation.diagnosis || '—'}
              </span>
            </div>

            <div className={styles.detailField}>
              <span className={styles.detailLabel}>Medications</span>
              {viewDetailsRow.consultation.medications &&
              viewDetailsRow.consultation.medications.length > 0 ? (
                <ul className={styles.medicationList}>
                  {viewDetailsRow.consultation.medications.map(
                    (medication, index) => (
                      <li key={index} className={styles.detailValue}>
                        {medication.name} — {medication.dose}
                        {medication.notes ? ` (${medication.notes})` : ''}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <span className={styles.detailValue}>
                  No medications recorded.
                </span>
              )}
            </div>

            {viewDetailsRow.consultation.follow_up_booking_id ? (
              <span className={styles.followUpIndicator}>
                Follow-up scheduled
                {viewDetailsRow.consultation.follow_up_date
                  ? ` for ${viewDetailsRow.consultation.follow_up_date}`
                  : ''}
              </span>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
