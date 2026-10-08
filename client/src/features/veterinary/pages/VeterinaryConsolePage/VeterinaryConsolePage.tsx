import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
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
  listServiceCatalog,
  updateConsultation,
} from '../../api/veterinary.api';
import type {
  Consultation,
  ConsultationFormResponse,
  MedicationInput,
  ServiceDone,
  VetServiceCatalogItem,
} from '../../veterinary.types';
import { ScheduleFollowUpModal } from '../../components/ScheduleFollowUpModal/ScheduleFollowUpModal';
import { ConsultationDetailPanel } from './ConsultationDetailPanel';
import { PrescribeModal } from './PrescribeModal';
import { ServicesDoneModal } from './ServicesDoneModal';
import {
  CONSULTATION_QUEUE_FILTER_FIELDS,
  CONSULTATION_QUEUE_SORT_FIELDS,
  CONSULTATION_STATUS_GROUPS,
  deriveDateRange,
  deriveStatusFilter,
} from './consultationQueueFilterFields';
import styles from './VeterinaryConsolePage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

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

/** What a Complete carries besides the services done: everything the
 * Consultation Details form holds. All optional - the queue row's quick
 * Complete sends none of it, so whatever is already saved on the visit is
 * left alone rather than overwritten with empty values. */
interface CompleteFields {
  diagnosis?: string;
  medications?: MedicationInput[];
  soldAtPharmacy?: boolean;
  formResponses?: ConsultationFormResponse[];
  vaccination?: {
    vaccine_name: string;
    date_administered: string;
    next_due_date?: string;
    notes?: string;
  };
}

/**
 * Custom change: this page used to be a permanent two-column split (queue +
 * an always-visible detail panel) - unlike every other staff queue page
 * (Bookings Queue, Grooming, Hotel, ...), which are a single full-width
 * list. That split reserved ~60% of the page for the detail panel even
 * when nothing was selected, which is why the queue list itself looked
 * narrower than every other queue's. It's also what made a plain row
 * click quietly "open the fill-in form" - confusing next to every other
 * page's tap-to-select/hold-or-"..."-for-actions convention.
 *
 * Now: the queue list is a normal full-width list (Table/List/Board, same
 * as everywhere else). A row's *only* actions are "Start Consultation"
 * (still a direct button on a Pending row - same confirm-modal flow as
 * before) and "View Details" (the row's "..." button in Table/List, or
 * hold/right-click in Board) - View Details opens the full
 * ConsultationDetailPanel (vitals-as-a-form/Prescription/Results/
 * vaccination/fee, all as sections of that one panel) in a modal, replacing
 * the three separate, overlapping things this page used to offer (an
 * inline detail panel, a read-only "View Details" modal, and a separate
 * read-only "Results" modal).
 */
export function VeterinaryConsolePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

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

  // The one consultation currently open in the "View Details" modal - not
  // set by a plain row click, only by the row's "View Details" action.
  const [openId, setOpenId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingStartId, setPendingStartId] = useState<string | null>(null);
  // Bumped to re-fetch the queue right away (instead of waiting for the
  // next interval) after a Start/Complete is refused - most often because
  // another vet took the consultation since this list loaded.
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  // Vet-priced visits: the visit waiting on the "Services done" pop-up.
  // Every Complete opens it - the queue row's quick Complete (no `fields`,
  // so nothing already saved on the visit is overwritten) and the details
  // form's Complete (its diagnosis/prescription/results/vaccination are held
  // here until the pop-up is confirmed, then sent in the same save).
  const [pendingComplete, setPendingComplete] = useState<{
    consultationId: string;
    fields: CompleteFields;
  } | null>(null);
  // The after-visit flow that follows a completed visit: Step 1 Prescription,
  // then Step 2 Follow-up consultation. Both optional - each can be skipped,
  // and Step 2 can go Back to Step 1.
  const [afterVisit, setAfterVisit] = useState<{
    consultationId: string;
    step: 'prescription' | 'followUp';
  } | null>(null);
  // The Completed visit whose Schedule follow-up form is open.
  const [followUpForId, setFollowUpForId] = useState<string | null>(null);
  // The clinic's shared service list, suggested from in that pop-up.
  const [serviceCatalog, setServiceCatalog] = useState<VetServiceCatalogItem[]>(
    []
  );

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
      // No bounds means "every date" on this page (the date tile was
      // removed, or set to All dates) - but no bounds alone means "today"
      // to the server, so it's stated outright.
      allDates: dateRange.from === null && dateRange.to === null,
    };

    void listConsultationQueue(token, queueDateRange).then(handleQueueResult);

    const interval = setInterval(() => {
      void listConsultationQueue(token, queueDateRange).then(handleQueueResult);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roleStatus, accessToken, dateRange.from, dateRange.to, queueRefreshKey]);

  useEffect(() => {
    // Veterinarian-only endpoint (vetWrite), same as the medicine list - any
    // other viewer can't complete a visit anyway.
    if (staffRole !== 'Veterinarian' || !accessToken) return;

    let isMounted = true;

    void listServiceCatalog(accessToken).then((result) => {
      if (isMounted && result.data) setServiceCatalog(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [staffRole, accessToken]);

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

  const openRow = rows.find((row) => row.consultation.id === openId);
  const pendingStartRow = rows.find(
    (row) => row.consultation.id === pendingStartId
  );
  const followUpRow = rows.find((row) => row.consultation.id === followUpForId);
  const afterVisitRow = rows.find(
    (row) => row.consultation.id === afterVisit?.consultationId
  );
  const pendingCompleteRow = rows.find(
    (row) => row.consultation.id === pendingComplete?.consultationId
  );

  // Mirrors the server's VETERINARY_WRITE_ROLES (veterinary.types.ts) - Admin
  // /Supervisor/Superadmin can view the console but any write PATCH/POST
  // gets a 403, so those controls must be disabled here too.
  const canWrite = staffRole === 'Veterinarian';

  /** A consultation belongs to the vet who took it (accepted_by) - once
   * someone else has, this vet can still read it but not act on it. Mirrors
   * consultation.service.ts's claimConsultation on the server. */
  function isHandledByAnotherVet(consultation: Consultation): boolean {
    return (
      consultation.accepted_by !== null && consultation.accepted_by !== user?.id
    );
  }

  /** Who may still correct a Completed visit's record: the vet who took it,
   * or - for a visit finished before accepted_by existed - the vet it was
   * assigned to. Mirrors consultation.service.ts's
   * updateFinishedConsultation on the server. */
  function handledThisVisit(consultation: Consultation): boolean {
    return (
      (consultation.accepted_by ?? consultation.veterinarian_id) === user?.id
    );
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
      setQueueRefreshKey((key) => key + 1);
      return;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
      )
    );
  }

  /** Runs once the "Services done" pop-up is confirmed - shared by the detail
   * panel's "Complete Consultation" and the row-level quick "Complete". medications/formResponses are optional so the quick
   * path leaves them out of the PATCH entirely - sending an empty array
   * would wipe whatever the consultation already has saved. Returns whether
   * it succeeded so the quick-complete modal knows to close. */
  async function handleComplete(
    consultationId: string,
    fields: CompleteFields,
    servicesDone: ServiceDone[]
  ): Promise<boolean> {
    if (!accessToken) return false;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(consultationId, accessToken, {
      status: 'Completed',
      diagnosis: fields.diagnosis,
      medications: fields.medications,
      sold_at_pharmacy: fields.soldAtPharmacy,
      form_responses: fields.formResponses,
      vaccination: fields.vaccination,
      services_done: servicesDone,
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not complete this consultation.');
      setQueueRefreshKey((key) => key + 1);
      return false;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
      )
    );
    return true;
  }

  /** Pharmacy prescriptions: the vet who handled a Completed visit correcting
   * its diagnosis/prescription from the detail panel's "Edit record". No
   * status is sent - the visit stays Completed; the server decides whether
   * the medicine transaction still follows the edit. Returns whether it
   * saved, so the panel knows to leave edit mode. */
  async function handleSaveRecord(
    consultationId: string,
    fields: {
      diagnosis: string;
      medications: MedicationInput[];
      soldAtPharmacy: boolean;
    }
  ): Promise<boolean> {
    if (!accessToken) return false;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(consultationId, accessToken, {
      diagnosis: fields.diagnosis,
      medications: fields.medications,
      sold_at_pharmacy: fields.soldAtPharmacy,
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not save these changes.');
      return false;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
      )
    );
    return true;
  }

  function openServicesDone(consultationId: string, fields: CompleteFields) {
    setSaveError(null);
    setPendingComplete({ consultationId, fields });
  }

  async function confirmServicesDone(servicesDone: ServiceDone[]) {
    if (!pendingComplete) return;

    const succeeded = await handleComplete(
      pendingComplete.consultationId,
      pendingComplete.fields,
      servicesDone
    );

    if (!succeeded) return;

    // The visit is done - on to prescribing, then the follow-up. The details
    // form is closed first so it can't sit behind the pop-ups showing the
    // prescription as it was before they changed it.
    const completedId = pendingComplete.consultationId;
    setPendingComplete(null);
    setOpenId(null);
    setAfterVisit({ consultationId: completedId, step: 'prescription' });
  }

  /** A follow-up was booked and linked - from the menu's form or Step 2. */
  function handleFollowUpLinked(linked: Consultation) {
    setConsultations((prev) =>
      prev.map((consultation) =>
        // Merged, not replaced: the link endpoint returns the visit without
        // the medicine-transaction join the queue carries.
        consultation.id === linked.id
          ? { ...consultation, ...linked }
          : consultation
      )
    );
  }

  /** Step 1 is done (saved or skipped) - on to the follow-up, when this vet
   * may schedule one for the visit; otherwise the flow is over. */
  function leavePrescriptionStep() {
    const consultation = afterVisitRow?.consultation;

    setSaveError(null);
    setAfterVisit(
      consultation && canScheduleFollowUp(consultation)
        ? { consultationId: consultation.id, step: 'followUp' }
        : null
    );
  }

  /** Saves Step 1's prescription. Only the prescription is sent, so the
   * diagnosis already on the visit is left alone. Resolves to whether it
   * saved - the step decides what happens next (continue, or print). */
  async function handleSavePrescription(fields: {
    medications: MedicationInput[];
    soldAtPharmacy: boolean;
  }): Promise<boolean> {
    if (!accessToken || !afterVisit) return false;

    setIsSaving(true);
    setSaveError(null);

    const result = await updateConsultation(
      afterVisit.consultationId,
      accessToken,
      {
        medications: fields.medications,
        sold_at_pharmacy: fields.soldAtPharmacy,
      }
    );

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not save this prescription.');
      return false;
    }

    const updated = result.data;
    setConsultations((prev) =>
      prev.map((consultation) =>
        consultation.id === updated.id ? updated : consultation
      )
    );
    return true;
  }

  /** The row's direct status action: Start on a Pending row, Complete on
   * an In Progress one - shared by the Table row actions and List/Board
   * cards. */
  function renderStatusAction(row: QueueRow) {
    if (!canWrite) return null;

    const rowBookingStatus = row.consultation.booking?.status;

    if (
      isHandledByAnotherVet(row.consultation) &&
      (rowBookingStatus === 'Pending' || rowBookingStatus === 'In Progress')
    ) {
      return (
        <span className={styles.rowMeta}>
          Being handled by another veterinarian
        </span>
      );
    }

    if (rowBookingStatus === 'Pending') {
      return (
        <button
          type="button"
          className={styles.startButton}
          disabled={isSaving}
          onClick={() => setPendingStartId(row.consultation.id)}
        >
          Start Consultation
        </button>
      );
    }

    if (rowBookingStatus === 'In Progress') {
      return (
        <button
          type="button"
          className={styles.startButton}
          disabled={isSaving}
          onClick={() => openServicesDone(row.consultation.id, {})}
        >
          Complete
        </button>
      );
    }

    // A finished visit's follow-up, right on the row - also still in the
    // row's options menu and the details panel.
    if (canScheduleFollowUp(row.consultation)) {
      return (
        <button
          type="button"
          className={styles.followUpButton}
          disabled={isSaving}
          onClick={() => setFollowUpForId(row.consultation.id)}
        >
          Schedule follow-up
        </button>
      );
    }

    if (
      rowBookingStatus === 'Completed' &&
      row.consultation.follow_up_booking_id
    ) {
      return <span className={styles.rowMeta}>Follow-up booked</span>;
    }

    return null;
  }

  const columns: DataTableColumn<QueueRow>[] = [
    { id: 'pet', header: 'Pet', render: (row) => row.petName },
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

  /** Vet-priced visits: a finished visit's follow-up may be scheduled once,
   * by the vet who handled it - mirrors followUp.service.ts's own checks on
   * the server. */
  function canScheduleFollowUp(consultation: Consultation): boolean {
    return (
      canWrite &&
      consultation.booking?.status === 'Completed' &&
      !consultation.follow_up_booking_id &&
      handledThisVisit(consultation)
    );
  }

  function buildRowMenuItems(row: QueueRow) {
    return [
      {
        label: 'View Details',
        onSelect: () => setOpenId(row.consultation.id),
      },
      ...(canScheduleFollowUp(row.consultation)
        ? [
            {
              label: 'Schedule follow-up',
              onSelect: () => setFollowUpForId(row.consultation.id),
            },
          ]
        : []),
    ];
  }

  function renderRowActions(row: QueueRow) {
    return (
      <div className={styles.rowActions}>
        {renderStatusAction(row)}
        <MoreOptionsMenu
          label={`Options for ${row.petName}`}
          items={buildRowMenuItems(row)}
        />
      </div>
    );
  }

  function renderCardContent(row: QueueRow) {
    const rowBookingStatus = row.consultation.booking?.status;

    return (
      <div className={styles.rowBody}>
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
        {renderStatusAction(row)}
      </div>
    );
  }

  // List view: a visible "..." button, same as Table's row-actions column -
  // a crowded card grid (Board) is the only view that needs hold/right-click
  // instead of a persistent button on every card.
  function renderListCard(row: QueueRow) {
    return (
      <div className={styles.rowItem}>
        {renderCardContent(row)}
        <MoreOptionsMenu
          label={`Options for ${row.petName}`}
          items={buildRowMenuItems(row)}
        />
      </div>
    );
  }

  function renderBoardCard(row: QueueRow) {
    return (
      <CardContextMenu
        label={`Options for ${row.petName}`}
        items={buildRowMenuItems(row)}
      >
        <div className={styles.rowItem}>{renderCardContent(row)}</div>
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
          <LoadingState label="Loading consultations..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : view === 'table' ? (
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
            renderItem={renderListCard}
            emptyMessage="No consultations match these filters."
          />
        ) : (
          <DataBoard
            groups={groupedRows}
            getRowKey={(row) => row.consultation.id}
            renderCard={renderBoardCard}
            emptyColumnMessage="No consultations here."
          />
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

      {/* Custom change: the single "View Details" action - everything that
          used to be split across an inline panel plus two separate
          read-only modals (View Details, Results) now lives here as one
          panel's worth of sections (vitals-as-a-form/Prescription/Results/
          vaccination/fee), read-only or editable depending on the
          consultation's own status, exactly as ConsultationDetailPanel
          already handled inline. */}
      <Modal
        isOpen={openRow !== undefined}
        title="Consultation Details"
        onClose={() => setOpenId(null)}
        closeOnBackdropClick={false}
        size="wide"
      >
        {openRow ? (
          <ConsultationDetailPanel
            key={openRow.consultation.id}
            consultation={openRow.consultation}
            petName={openRow.petName}
            ownerName={openRow.ownerName}
            accessToken={accessToken}
            canWrite={canWrite && !isHandledByAnotherVet(openRow.consultation)}
            isSaving={isSaving}
            saveError={saveError}
            onStart={() => setPendingStartId(openRow.consultation.id)}
            onComplete={(fields) =>
              openServicesDone(openRow.consultation.id, fields)
            }
            canEditRecord={canWrite && handledThisVisit(openRow.consultation)}
            onSaveRecord={(fields) =>
              handleSaveRecord(openRow.consultation.id, fields)
            }
            onScheduleFollowUp={() => setFollowUpForId(openRow.consultation.id)}
          />
        ) : null}
      </Modal>

      {followUpRow?.consultation.booking && user?.id ? (
        <ScheduleFollowUpModal
          key={followUpRow.consultation.id}
          accessToken={accessToken}
          consultationId={followUpRow.consultation.id}
          petId={followUpRow.consultation.pet_id}
          petName={followUpRow.petName}
          customerId={followUpRow.consultation.booking.customer_id}
          ownerName={followUpRow.ownerName}
          branchId={followUpRow.consultation.booking.branch_id}
          veterinarianId={user.id}
          onClose={() => setFollowUpForId(null)}
          onLinked={handleFollowUpLinked}
        />
      ) : null}

      {afterVisit?.step === 'prescription' && afterVisitRow ? (
        <PrescribeModal
          key={afterVisitRow.consultation.id}
          consultation={afterVisitRow.consultation}
          petName={afterVisitRow.petName}
          accessToken={accessToken}
          stepLabel={
            canScheduleFollowUp(afterVisitRow.consultation)
              ? 'Step 1 of 2'
              : 'Step 1 of 1'
          }
          isSaving={isSaving}
          error={saveError}
          onSave={handleSavePrescription}
          onContinue={leavePrescriptionStep}
          onSkip={leavePrescriptionStep}
          onClose={() => {
            setSaveError(null);
            setAfterVisit(null);
          }}
        />
      ) : null}

      {afterVisit?.step === 'followUp' &&
      afterVisitRow?.consultation.booking &&
      user?.id ? (
        <ScheduleFollowUpModal
          key={`after-visit-${afterVisitRow.consultation.id}`}
          accessToken={accessToken}
          consultationId={afterVisitRow.consultation.id}
          petId={afterVisitRow.consultation.pet_id}
          petName={afterVisitRow.petName}
          customerId={afterVisitRow.consultation.booking.customer_id}
          ownerName={afterVisitRow.ownerName}
          branchId={afterVisitRow.consultation.booking.branch_id}
          veterinarianId={user.id}
          stepLabel="Step 2 of 2"
          onBack={() =>
            setAfterVisit({
              consultationId: afterVisitRow.consultation.id,
              step: 'prescription',
            })
          }
          onClose={() => setAfterVisit(null)}
          onLinked={handleFollowUpLinked}
        />
      ) : null}

      {pendingComplete ? (
        <ServicesDoneModal
          key={pendingComplete.consultationId}
          petName={pendingCompleteRow?.petName ?? 'this pet'}
          catalog={serviceCatalog}
          isSaving={isSaving}
          error={saveError}
          onConfirm={(servicesDone) => void confirmServicesDone(servicesDone)}
          onCancel={() => {
            setSaveError(null);
            setPendingComplete(null);
          }}
        />
      ) : null}
    </main>
  );
}
