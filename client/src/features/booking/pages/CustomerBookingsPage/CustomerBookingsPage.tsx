import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  CalendarDays,
  Columns3,
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
} from 'lucide-react';
import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { useCreditBalance } from '../../../credits/providers/useCreditBalance';
import { notifyCreditBalanceChanged } from '../../../credits/providers/creditBalanceEvents';
import { listCustomerPets } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataCalendar } from '../../../../shared/components/DataCalendar/DataCalendar';
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
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { BookingConfirmationBadge } from '../../components/shared/BookingConfirmationBadge/BookingConfirmationBadge';
import { BookingDetailsModal } from '../../components/BookingDetailsModal/BookingDetailsModal';
import { SlotPicker } from '../../components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../components/StaffPickerList/StaffPickerList';
import {
  cancelBooking,
  listBookings,
  rescheduleBooking,
} from '../../api/booking.api';
import {
  CANCELLABLE_BOOKING_STATUSES,
  RESCHEDULABLE_BOOKING_STATUSES,
  type Booking,
  type StaffPreferenceInput,
} from '../../booking.types';
import {
  applyBookingFilters,
  BOOKING_COMPARATORS,
  BOOKING_SORT_FIELDS,
  bookingCalendarDateKey,
  branchNameOf,
  buildBookingFilterFields,
  buildBookingGroupByAxes,
  deriveBookingSortKey,
  matchesBookingQuery,
  petNameOf,
  type BookingLookups,
} from './bookingBrowserFields';
import styles from './CustomerBookingsPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' });
}

type ActiveAction = {
  bookingId: string;
  type: 'reschedule' | 'cancel';
};

type ViewMode = 'table' | 'list' | 'gallery' | 'board' | 'calendar';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { value: 'board', label: 'Board', icon: Columns3 },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
];

type CalendarMode = 'month' | 'week';

/**
 * Issue #59: the customer's own bookings, with reschedule (re-entering the
 * Slot/Staff Picker scoped to the existing booking, per dev notes - not a
 * full re-entry of the 8-step flow) and cancel (behind an explicit confirm
 * step, AC-5).
 *
 * Payment/transactions rework: paying for a booking moved out of here
 * entirely - it now lives on the Transaction History page
 * (`/portal/transactions`), per transaction. View details, Reschedule and
 * Cancel are the only actions here.
 *
 * Config-menu consistency change: the list gained the same search / filter /
 * sort / group-by / view controls as the rest of the app (table, list,
 * gallery, board, calendar). Table and list rows carry a visible "..." menu;
 * gallery, board and calendar cards open the same menu with right-click /
 * press-and-hold instead, like every other card view. Cancel is offered for
 * any booking the server will cancel - waiting for payment ("Unconfirmed"),
 * paid ("Confirmed"), or already being served ("In service").
 */
export function CustomerBookingsPage() {
  const { user, accessToken } = useAuth();
  const { refresh: refreshCreditBalance } = useCreditBalance();
  const nowMs = useNowMs();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [rescheduleStaffPreference, setRescheduleStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  // Resolved from GET /bookings/staff-picker (customer-accessible) once
  // StaffPickerList mounts - not GET /bookings/policy, which is staff-only
  // (#52). See StaffPickerList's onUnavailable contract.
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [groupAxisId, setGroupAxisId] = useState('status');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void Promise.all([
      listBookings(accessToken),
      listCustomerPets(user.id, accessToken),
      listBranches(),
    ]).then(([bookingsResult, petsResult, branchesResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (bookingsResult.error || !bookingsResult.data) {
        setLoadError(bookingsResult.error ?? 'Could not load your bookings.');
        return;
      }

      setBookings(bookingsResult.data);
      setPets(petsResult.data ?? []);
      setBranches(branchesResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  // Slot-conflict notification: a `?open=<bookingId>` deep link (from the
  // dashboard popup or a booking_slot_conflict notification) auto-opens that
  // booking's details on arrival - same query-param convention as
  // NotificationsPage's own `?open=`. Derived at render time (not synced
  // into state via an effect - react-hooks/set-state-in-effect) so the
  // "View details" menu's own setDetailsBookingId click-state and this URL
  // param both just feed the same modal.
  const detailsTargetId = detailsBookingId ?? searchParams.get('open');

  function closeDetails() {
    setDetailsBookingId(null);
    if (searchParams.has('open')) {
      const params = new URLSearchParams(searchParams);
      params.delete('open');
      setSearchParams(params);
    }
  }

  const petNameById = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet.name])),
    [pets]
  );
  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );
  const lookups = useMemo<BookingLookups>(
    () => ({ petNameById, branchNameById }),
    [petNameById, branchNameById]
  );

  const filterFields = useMemo(
    () => buildBookingFilterFields(bookings, lookups),
    [bookings, lookups]
  );
  const groupByAxes = useMemo(
    () => buildBookingGroupByAxes(bookings, lookups),
    [bookings, lookups]
  );

  const visibleBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? bookings.filter((booking) =>
          matchesBookingQuery(booking, query, lookups)
        )
      : bookings;
    const filtered = applyBookingFilters(searched, filterTiles, lookups);
    const sortKey = deriveBookingSortKey(sortTile);

    // No sort tile means "keep the order the server returned" rather than
    // silently imposing a default sort.
    if (!sortKey) return filtered;
    return [...filtered].sort(BOOKING_COMPARATORS[sortKey]);
  }, [bookings, search, filterTiles, sortTile, lookups]);

  const activeGroupAxis =
    groupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedBookings = useGroupBy(
    visibleBookings,
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

  function replaceBooking(updated: Booking) {
    setBookings((prev) =>
      prev.map((booking) => (booking.id === updated.id ? updated : booking))
    );
  }

  function openReschedule(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'reschedule' });
    setRescheduleSlot(null);
    setRescheduleStaffPreference(null);
    setStaffPickerUnavailable(false);
    setActionError(null);
    setActionMessage(null);
  }

  function openCancel(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'cancel' });
    setCancellationReason('');
    setActionError(null);
    setActionMessage(null);
  }

  function closeAction() {
    setActiveAction(null);
  }

  async function confirmReschedule(booking: Booking) {
    if (!accessToken || !rescheduleSlot) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await rescheduleBooking(booking.id, accessToken, {
      scheduled_start: rescheduleSlot.start,
      scheduled_end: rescheduleSlot.end,
      ...(rescheduleStaffPreference
        ? { staff_preference: rescheduleStaffPreference }
        : {}),
    });

    setIsSubmittingAction(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not reschedule this booking.');
      return;
    }

    replaceBooking(result.data.booking);
    setActionMessage(
      result.data.policy_violation
        ? 'Rescheduled, but this change did not meet the configured notice period.'
        : 'Booking rescheduled.'
    );
    setActiveAction(null);
  }

  async function confirmCancel(booking: Booking) {
    if (!accessToken) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await cancelBooking(booking.id, accessToken, {
      ...(cancellationReason.trim()
        ? { cancellation_reason: cancellationReason.trim() }
        : {}),
    });

    setIsSubmittingAction(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not cancel this booking.');
      return;
    }

    replaceBooking(result.data.booking);
    if (result.data.credit_issued) {
      // Pull the new balance so the navbar credit pill (and the portal home)
      // reflect the just-issued credit without a page reload - both via the
      // context and the global event, since the pill has been flaky.
      refreshCreditBalance();
      notifyCreditBalanceChanged();
    }
    const branchName = branchNameById.get(booking.branch_id) ?? 'this branch';
    setActionMessage(
      result.data.credit_issued
        ? `Booking cancelled. Your payment has been converted into account credit at ${branchName} for a future visit.`
        : result.data.policy_violation
          ? 'Booking cancelled. This did not meet the required notice period, so any payment was forfeited.'
          : 'Booking cancelled.'
    );
    setActiveAction(null);
  }

  function bookingTitle(booking: Booking): string {
    return `${booking.service_category} - ${petNameOf(booking, lookups)}`;
  }

  function bookingMenuItems(booking: Booking): MoreOptionsMenuItem[] {
    // Reschedule additionally requires the appointment itself to still be
    // ahead of us - matches reschedule.service.ts's own past-due guard
    // server-side.
    const isPastDue = new Date(booking.scheduled_start).getTime() <= nowMs;
    const canReschedule =
      RESCHEDULABLE_BOOKING_STATUSES.includes(booking.status) && !isPastDue;
    const canCancel = CANCELLABLE_BOOKING_STATUSES.includes(booking.status);

    return [
      {
        label: 'View details',
        onSelect: () => setDetailsBookingId(booking.id),
      },
      ...(canReschedule
        ? [
            {
              label: 'Reschedule',
              onSelect: () => openReschedule(booking),
            },
          ]
        : []),
      ...(canCancel
        ? [{ label: 'Cancel', onSelect: () => openCancel(booking) }]
        : []),
    ];
  }

  // The whole summary is a button that opens the same details modal as the
  // menu's "View details".
  function renderBookingSummary(booking: Booking) {
    return (
      <button
        type="button"
        className={styles.bookingMain}
        onClick={() => setDetailsBookingId(booking.id)}
      >
        <span className={styles.bookingTitle}>{bookingTitle(booking)}</span>
        <span className={styles.bookingMeta}>
          {branchNameOf(booking, lookups)} -{' '}
          {formatDateTime(booking.scheduled_start)}
        </span>
        <BookingConfirmationBadge booking={booking} />
      </button>
    );
  }

  // Table/List: a persistent "..." trigger.
  function renderRowMenu(booking: Booking) {
    return (
      <MoreOptionsMenu
        label={`Actions for ${bookingTitle(booking)}`}
        items={bookingMenuItems(booking)}
      />
    );
  }

  // Gallery/Board/Calendar: right-click / press-and-hold opens the same menu
  // - a kebab button on every card in a dense grid is visual noise (same
  // precedent as Staff/Customer Management).
  function renderContextCard(booking: Booking, content: ReactNode) {
    return (
      <CardContextMenu
        label={`Actions for this ${booking.service_category} booking`}
        items={bookingMenuItems(booking)}
      >
        {content}
      </CardContextMenu>
    );
  }

  const columns: DataTableColumn<Booking>[] = [
    {
      id: 'booking',
      header: 'Booking',
      render: (booking) => (
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => setDetailsBookingId(booking.id)}
        >
          {bookingTitle(booking)}
        </button>
      ),
    },
    {
      id: 'branch',
      header: 'Branch',
      render: (booking) => branchNameOf(booking, lookups),
    },
    {
      id: 'when',
      header: 'Appointment',
      render: (booking) => formatDateTime(booking.scheduled_start),
    },
    {
      id: 'status',
      header: 'Status',
      render: (booking) => <BookingConfirmationBadge booking={booking} />,
    },
  ];

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your bookings.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <LoadingState label="Loading your bookings..." />
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

  // AC-5: cancellation always goes through this explicit modal dialog - a
  // stray/double click on the row's "Cancel" menu item opens it, it never
  // executes the cancellation.
  const cancelTarget =
    activeAction?.type === 'cancel'
      ? bookings.find((booking) => booking.id === activeAction.bookingId)
      : undefined;

  const rescheduleTarget =
    activeAction?.type === 'reschedule'
      ? bookings.find((booking) => booking.id === activeAction.bookingId)
      : undefined;

  function renderReschedulePanel(booking: Booking) {
    const durationMinutes = Math.round(
      (new Date(booking.scheduled_end).getTime() -
        new Date(booking.scheduled_start).getTime()) /
        60000
    );
    const petWeightClass =
      booking.service_category === 'Hotel'
        ? (pets.find((pet) => pet.id === booking.pet_id)?.weight_class ??
          undefined)
        : undefined;
    // Custom change: Staff Picker eligibility addendum - was hardcoded to
    // Grooming/Veterinary; now StaffPickerList resolves eligibility itself
    // (staff_picker_enabled per service_types row) and self-hides via
    // onUnavailable, so no client-side category check is needed here.
    const showStaffPicker = rescheduleSlot !== null && !staffPickerUnavailable;

    return (
      <section
        className={styles.actionPanel}
        aria-label={`Reschedule ${bookingTitle(booking)}`}
      >
        <h2 className={styles.panelTitle}>
          Reschedule: {bookingTitle(booking)}
        </h2>

        <SlotPicker
          accessToken={accessToken as string}
          branchId={booking.branch_id}
          serviceCategory={booking.service_category}
          slotDurationMinutes={durationMinutes}
          petWeightClass={petWeightClass}
          viewerMode="customer"
          intent="reschedule"
          selectedSlot={rescheduleSlot}
          onSelect={setRescheduleSlot}
        />

        {showStaffPicker && rescheduleSlot ? (
          <StaffPickerList
            accessToken={accessToken as string}
            branchId={booking.branch_id}
            serviceCategory={booking.service_category}
            scheduledStart={rescheduleSlot.start}
            scheduledEnd={rescheduleSlot.end}
            selected={rescheduleStaffPreference}
            onSelect={setRescheduleStaffPreference}
            onUnavailable={() => setStaffPickerUnavailable(true)}
          />
        ) : null}

        {actionError ? (
          <p className={styles.errorBanner} role="alert">
            {actionError}
          </p>
        ) : null}

        <div className={styles.bookingControls}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!rescheduleSlot || isSubmittingAction}
            onClick={() => void confirmReschedule(booking)}
          >
            {isSubmittingAction ? 'Rescheduling...' : 'Confirm new time'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={closeAction}
          >
            Cancel reschedule
          </button>
        </div>
      </section>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>My bookings</h1>

      {actionMessage ? (
        <p className={styles.successBanner} role="status">
          {actionMessage}
        </p>
      ) : null}

      {rescheduleTarget ? renderReschedulePanel(rescheduleTarget) : null}

      {bookings.length === 0 ? (
        <p className={styles.copy}>You have no bookings yet.</p>
      ) : (
        <>
          <FilterSortBar
            filterFields={filterFields}
            filterTiles={filterTiles}
            onAddFilter={handleAddFilter}
            onChangeFilter={handleChangeFilter}
            onRemoveFilter={handleRemoveFilter}
            sortFields={BOOKING_SORT_FIELDS}
            sortTile={sortTile}
            onChangeSort={setSortTile}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search your bookings..."
          >
            <div className={styles.viewControls}>
              <ViewSwitcher
                options={VIEW_OPTIONS}
                value={view}
                onChange={setView}
                ariaLabel="Bookings view"
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
                    {groupByAxes.map((axis) => (
                      <option key={axis.id} value={axis.id}>
                        {axis.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {view === 'calendar' ? (
                <label className={styles.filterField}>
                  <span className={styles.filterLabel}>Calendar range</span>
                  <select
                    className={styles.filterSelect}
                    value={calendarMode}
                    onChange={(event) =>
                      setCalendarMode(event.target.value as CalendarMode)
                    }
                    aria-label="Calendar range"
                  >
                    <option value="month">Month</option>
                    <option value="week">Week</option>
                  </select>
                </label>
              ) : null}
            </div>
          </FilterSortBar>

          {view === 'table' ? (
            <DataTable
              columns={columns}
              rows={visibleBookings}
              getRowKey={(booking) => booking.id}
              renderRowActions={renderRowMenu}
              emptyMessage="No bookings match this filter."
            />
          ) : view === 'list' ? (
            <DataList
              items={visibleBookings}
              getRowKey={(booking) => booking.id}
              renderItem={(booking) => (
                <div className={styles.listRow}>
                  {renderBookingSummary(booking)}
                  {renderRowMenu(booking)}
                </div>
              )}
              emptyMessage="No bookings match this filter."
            />
          ) : view === 'gallery' ? (
            visibleBookings.length === 0 ? (
              <p className={styles.copy}>No bookings match this filter.</p>
            ) : (
              <ul className={styles.gallery}>
                {visibleBookings.map((booking) => (
                  <li key={booking.id} className={styles.galleryCard}>
                    {renderContextCard(booking, renderBookingSummary(booking))}
                  </li>
                ))}
              </ul>
            )
          ) : view === 'board' ? (
            <DataBoard
              groups={groupedBookings}
              getRowKey={(booking) => booking.id}
              renderCard={(booking) => (
                <div className={styles.boardCard}>
                  {renderContextCard(booking, renderBookingSummary(booking))}
                </div>
              )}
              emptyColumnMessage="No bookings here."
            />
          ) : (
            <DataCalendar
              mode={calendarMode}
              anchorDate={calendarAnchor}
              onAnchorDateChange={setCalendarAnchor}
              items={visibleBookings}
              getItemDate={bookingCalendarDateKey}
              getRowKey={(booking) => booking.id}
              renderChip={(booking) =>
                renderContextCard(
                  booking,
                  <button
                    type="button"
                    className={styles.calendarChip}
                    onClick={() => setDetailsBookingId(booking.id)}
                  >
                    {formatTime(booking.scheduled_start)}{' '}
                    {bookingTitle(booking)}
                  </button>
                )
              }
            />
          )}
        </>
      )}

      <BookingDetailsModal bookingId={detailsTargetId} onClose={closeDetails} />

      <ConfirmDialog
        isOpen={cancelTarget !== undefined}
        title="Cancel this booking?"
        tone="danger"
        confirmLabel="Yes, cancel"
        cancelLabel="Keep booking"
        isConfirming={isSubmittingAction}
        onCancel={closeAction}
        onConfirm={() => {
          if (cancelTarget) void confirmCancel(cancelTarget);
        }}
        body={
          <>
            <p>
              Are you sure you want to cancel this booking? This can&apos;t be
              undone.
            </p>
            {cancelTarget?.payment_status === 'Fully Paid' ||
            cancelTarget?.payment_status === 'Partially Paid' ? (
              <p>
                Any payment you&apos;ve already made &mdash; a down payment or
                the full amount &mdash; won&apos;t be refunded. If you cancel
                with enough notice it becomes <strong>account credit</strong> at
                this branch that you can use on a future visit; a late
                cancellation forfeits it.
              </p>
            ) : null}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Reason (optional)</span>
              <textarea
                className={styles.input}
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
              />
            </label>
            {actionError ? (
              <p className={styles.errorBanner} role="alert">
                {actionError}
              </p>
            ) : null}
          </>
        }
      />
    </main>
  );
}
