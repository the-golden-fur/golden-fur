import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { BookingStatusBadge } from '../../components/shared/BookingStatusBadge/BookingStatusBadge';
import { SlotPicker } from '../../components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../components/StaffPickerList/StaffPickerList';
import {
  cancelBooking,
  listBookings,
  rescheduleBooking,
} from '../../api/booking.api';
import {
  SERVICE_CATEGORIES,
  type Booking,
  type BookingStatus,
  type ServiceCategory,
  type StaffPreferenceInput,
} from '../../booking.types';
import styles from './ReceptionistBookingsQueuePage.module.css';

const BOOKING_STATUSES: BookingStatus[] = [
  'Confirmed',
  'Pending',
  'Completed',
  'Cancelled',
  'No-show',
];
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All statuses' },
  ...BOOKING_STATUSES.map((status) => ({ value: status, label: status })),
];
const RESCHEDULABLE_STATUSES = new Set(['Confirmed', 'Pending']);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type ActiveAction = { bookingId: string; type: 'reschedule' | 'cancel' };

/**
 * Issue #60: branch-wide daily/filtered booking queue for Receptionist/
 * Admin/Supervisor/Superadmin (branch filter additionally shown for
 * Superadmin, AC-2). Reschedule/cancel call the same #54 endpoints a
 * customer would, with the requesting staff_id recorded server-side from
 * the JWT - no separate receptionist-only endpoint (dev notes).
 */
export function ReceptionistBookingsQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchFilter, setBranchFilter] = useState('All');
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'All'>(
    'All'
  );
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>(
    'All'
  );

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [rescheduleStaffPreference, setRescheduleStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  // Resolved from GET /bookings/staff-picker once StaffPickerList mounts -
  // see StaffPickerList's onUnavailable contract.
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Viewer role/branch via the requester's own row in GET /staff, same
  // recipe as every other admin-adjacent staff page (the JWT's user.role is
  // just Postgres "authenticated" - the app role only lives in staff_profiles).
  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
      setViewerBranchId(self?.branch_id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, []);

  const effectiveBranchId = isSuperadmin
    ? branchFilter === 'All'
      ? undefined
      : branchFilter
    : (viewerBranchId ?? undefined);

  useEffect(() => {
    if (!accessToken || isRoleLoading) return;

    const token = accessToken;
    let isMounted = true;

    void listBookings(token, {
      branchId: effectiveBranchId,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
      serviceCategory: categoryFilter === 'All' ? undefined : categoryFilter,
      status: statusFilter === 'All' ? undefined : statusFilter,
    }).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the bookings queue.');
        return;
      }

      setLoadError(null);
      setBookings(result.data);

      const petIds = new Set(result.data.map((booking) => booking.pet_id));
      const customerIds = new Set(
        result.data.map((booking) => booking.customer_id)
      );

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
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isRoleLoading,
    effectiveBranchId,
    dateRange.from,
    dateRange.to,
    categoryFilter,
    statusFilter,
  ]);

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

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
  }

  function openCancel(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'cancel' });
    setCancellationReason('');
    setActionError(null);
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
    setActiveAction(null);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the bookings queue.
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

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bookings queue</h1>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate('/staff/bookings/new')}
          >
            New booking
          </button>
        </div>

        <QueueFilterBar
          dateRangePreset={dateRangePreset}
          onDateRangePresetChange={setDateRangePreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          statusValue={statusFilter}
          onStatusChange={(value) =>
            setStatusFilter(value as BookingStatus | 'All')
          }
          statusOptions={STATUS_OPTIONS}
        >
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Service type</span>
            <select
              className={styles.filterSelect}
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as ServiceCategory | 'All')
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

          {isSuperadmin ? (
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
          ) : null}
        </QueueFilterBar>

        {isLoading ? <p className={styles.copy}>Loading bookings...</p> : null}

        {loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : null}

        {!isLoading && !loadError && bookings.length === 0 ? (
          <p className={styles.copy}>No bookings match these filters.</p>
        ) : null}

        {!isLoading && !loadError && bookings.length > 0 ? (
          <ul className={styles.bookingList}>
            {bookings.map((booking) => {
              const isActionable = RESCHEDULABLE_STATUSES.has(booking.status);
              const isRescheduling =
                activeAction?.bookingId === booking.id &&
                activeAction.type === 'reschedule';
              const isCancelling =
                activeAction?.bookingId === booking.id &&
                activeAction.type === 'cancel';

              const durationMinutes = Math.round(
                (new Date(booking.scheduled_end).getTime() -
                  new Date(booking.scheduled_start).getTime()) /
                  60000
              );
              const showStaffPicker =
                (booking.service_category === 'Grooming' ||
                  booking.service_category === 'Veterinary') &&
                rescheduleSlot !== null &&
                !staffPickerUnavailable;

              return (
                <li key={booking.id} className={styles.bookingRow}>
                  <div className={styles.bookingMain}>
                    <span className={styles.bookingTitle}>
                      {booking.service_category}
                    </span>
                    <span className={styles.bookingMeta}>
                      {branchNameById.get(booking.branch_id) ?? 'Branch'} -{' '}
                      {formatDateTime(booking.scheduled_start)}
                    </span>
                    <span className={styles.bookingMeta}>
                      {pets[booking.pet_id]?.name ?? 'Unknown pet'} - Owner{' '}
                      {owners[booking.customer_id]?.full_name ??
                        'Unknown owner'}
                    </span>
                    <BookingStatusBadge status={booking.status} />
                  </div>

                  {isActionable && !isRescheduling && !isCancelling ? (
                    <div className={styles.bookingControls}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => openReschedule(booking)}
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => openCancel(booking)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  {isRescheduling ? (
                    <div className={styles.actionPanel}>
                      <SlotPicker
                        accessToken={accessToken}
                        branchId={booking.branch_id}
                        serviceCategory={booking.service_category}
                        slotDurationMinutes={durationMinutes}
                        viewerMode="staff"
                        selectedSlot={rescheduleSlot}
                        onSelect={setRescheduleSlot}
                      />

                      {showStaffPicker && rescheduleSlot ? (
                        <StaffPickerList
                          accessToken={accessToken}
                          branchId={booking.branch_id}
                          serviceCategory={
                            booking.service_category as
                              | 'Grooming'
                              | 'Veterinary'
                          }
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
                          {isSubmittingAction
                            ? 'Rescheduling...'
                            : 'Confirm new time'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={closeAction}
                        >
                          Cancel reschedule
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isCancelling ? (
                    <div className={styles.actionPanel}>
                      <p className={styles.copy} role="alert">
                        Cancel this booking on the customer's behalf? This
                        cannot be undone.
                      </p>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          Reason (optional)
                        </span>
                        <textarea
                          className={styles.input}
                          value={cancellationReason}
                          onChange={(event) =>
                            setCancellationReason(event.target.value)
                          }
                        />
                      </label>

                      {actionError ? (
                        <p className={styles.errorBanner} role="alert">
                          {actionError}
                        </p>
                      ) : null}

                      <div className={styles.bookingControls}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={isSubmittingAction}
                          onClick={() => void confirmCancel(booking)}
                        >
                          {isSubmittingAction
                            ? 'Cancelling...'
                            : 'Yes, cancel booking'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={closeAction}
                        >
                          Keep booking
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
