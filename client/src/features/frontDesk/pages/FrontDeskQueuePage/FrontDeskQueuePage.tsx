import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { DaycareCheckoutPanel } from '../../../daycare/pages/DaycareQueuePage/DaycareCheckoutPanel';
import { HotelCheckoutPanel } from '../../../hotel/pages/HotelQueuePage/HotelCheckoutPanel';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { getStaffProfile } from '../../../staff/api/staff.api';
import type { StaffRole } from '../../../staff/staff.types';
import { listServiceCatalog } from '../../../veterinary/api/veterinary.api';
import { ServicesDoneModal } from '../../../veterinary/pages/VeterinaryConsolePage/ServicesDoneModal';
import type {
  ServiceDone,
  VetServiceCatalogItem,
} from '../../../veterinary/veterinary.types';
import {
  completeFrontDeskBooking,
  startFrontDeskBooking,
} from '../../api/frontDesk.api';
import { FrontDeskAssessDialog } from '../../components/FrontDeskAssessDialog/FrontDeskAssessDialog';
import { getRowActions } from '../../frontDeskActions';
import type { FrontDeskAction, FrontDeskQueueRow } from '../../frontDesk.types';
import { useFrontDeskQueue } from '../../hooks/useFrontDeskQueue';
import styles from './FrontDeskQueuePage.module.css';

const ALLOWED_VIEWER_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>([
  'Receptionist',
  'Front Desk',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

const SERVICE_OPTIONS = ['Grooming', 'Veterinary', 'Hotel', 'Daycare'];
const ACTIVE_FILTER = 'Active';
const STATUS_OPTIONS = [
  ACTIVE_FILTER,
  'Pending',
  'Late',
  'In Progress',
  'Completed',
  'No-show',
  'Cancelled',
  'All',
];

const ACTION_LABELS: Record<FrontDeskAction, string> = {
  assess: 'Assess pet',
  start: 'Start',
  complete: 'Complete',
  'check-in': 'Check In',
  'check-out': 'Check Out',
};

function isActive(row: FrontDeskQueueRow): boolean {
  const { status } = row.booking;
  return status === 'Pending' || status === 'Late' || status === 'In Progress';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function matchesSearch(row: FrontDeskQueueRow, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;

  return [row.pet_name, row.owner_name, row.assigned_staff_name].some((name) =>
    name?.toLowerCase().includes(term)
  );
}

/**
 * Every service's bookings in one list, so reception can move any of them
 * along without waiting on the groomer or vet. Each row shows only its next
 * step, and Hotel/Daycare go through their real check-in and check-out so
 * stays close, bills post and cages free up.
 */
export function FrontDeskQueuePage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [viewerRole, setViewerRole] = useState<StaffRole | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState(ACTIVE_FILTER);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<VetServiceCatalogItem[]>([]);

  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmGroomRow, setConfirmGroomRow] =
    useState<FrontDeskQueueRow | null>(null);
  const [vetRow, setVetRow] = useState<FrontDeskQueueRow | null>(null);
  const [assessRow, setAssessRow] = useState<FrontDeskQueueRow | null>(null);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(
    null
  );

  const isSuperadmin = viewerRole === 'Superadmin';
  const { rows, isLoading, error, refresh } = useFrontDeskQueue(
    accessToken,
    isSuperadmin && branchFilter ? branchFilter : undefined,
    roleStatus === 'ok'
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;
    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      const role = result.data?.role;
      setRoleStatus(role && ALLOWED_VIEWER_ROLES.has(role) ? 'ok' : 'denied');
      setViewerRole(role ?? null);
      setViewerBranchId(result.data?.branch_id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!isSuperadmin) return;
    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, [isSuperadmin]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;
    void listServiceCatalog(accessToken).then((result) => {
      if (result.data) setCatalog(result.data);
    });
  }, [roleStatus, accessToken]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          // An open check-out panel stays put, so its bill can be read
          // after the booking turns Completed.
          row.booking.id === checkoutBookingId ||
          ((serviceFilter === 'All' ||
            row.booking.service_category === serviceFilter) &&
            (statusFilter === 'All' ||
              (statusFilter === ACTIVE_FILTER
                ? isActive(row)
                : row.booking.status === statusFilter)) &&
            matchesSearch(row, search))
      ),
    [rows, serviceFilter, statusFilter, search, checkoutBookingId]
  );

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/dashboard" replace />;
  }

  async function runAdvance(
    bookingId: string,
    request: (token: string) => Promise<{ error: string | null }>,
    successMessage: string
  ) {
    if (!accessToken) return;

    setBusyBookingId(bookingId);
    setActionError(null);
    setMessage(null);

    const result = await request(accessToken);

    setBusyBookingId(null);

    if (result.error) {
      setActionError(result.error);
      return false;
    }

    setMessage(successMessage);
    refresh();
    return true;
  }

  function handleAction(row: FrontDeskQueueRow, action: FrontDeskAction) {
    const { booking } = row;
    const pet = row.pet_name ?? 'This pet';

    setActionError(null);
    setMessage(null);

    if (action === 'assess') {
      setAssessRow(row);
    } else if (action === 'start') {
      void runAdvance(
        booking.id,
        (token) => startFrontDeskBooking(booking.id, token),
        `${pet}'s ${booking.service_category} has started.`
      );
    } else if (action === 'complete') {
      if (booking.service_category === 'Veterinary') setVetRow(row);
      else setConfirmGroomRow(row);
    } else if (action === 'check-in') {
      const service =
        booking.service_category === 'Hotel' ? 'hotel' : 'daycare';
      navigate(
        `/staff/${service}/queue/check-in/${booking.id}?from=front-desk`
      );
    } else {
      setCheckoutBookingId(
        checkoutBookingId === booking.id ? null : booking.id
      );
    }
  }

  async function completeVet(lines: ServiceDone[]) {
    if (!vetRow) return;
    const { booking, pet_name: petName } = vetRow;

    const completed = await runAdvance(
      booking.id,
      (token) => completeFrontDeskBooking(booking.id, token, lines),
      `${petName ?? 'This pet'}'s visit is complete.`
    );

    if (completed) setVetRow(null);
  }

  async function completeGroom() {
    if (!confirmGroomRow) return;
    const { booking, pet_name: petName } = confirmGroomRow;

    await runAdvance(
      booking.id,
      (token) => completeFrontDeskBooking(booking.id, token),
      `${petName ?? 'This pet'}'s grooming is complete.`
    );
    setConfirmGroomRow(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>Front Desk Queue</h1>
          <p className={styles.copy}>
            Today's bookings from every service, plus anything still in
            progress. You can complete any of them without waiting for other
            staff.
          </p>
        </header>

        <div className={styles.filters}>
          <label className={styles.searchField}>
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder="Pet, owner or staff"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Service</span>
            <select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
            >
              <option value="All">All services</option>
              {SERVICE_OPTIONS.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          {isSuperadmin ? (
            <label className={styles.field}>
              <span>Branch</span>
              <select
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
              >
                <option value="">My branch</option>
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}
        {actionError || error ? (
          <p className={styles.errorBanner} role="alert">
            {actionError ?? error}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading the queue…</p>
        ) : visibleRows.length === 0 ? (
          <p className={styles.copy}>No bookings match these filters.</p>
        ) : (
          <ul className={styles.list}>
            {visibleRows.map((row) => {
              const { booking } = row;
              const { action, blockedReason } = getRowActions(
                row,
                viewerBranchId
              );
              const isBusy = busyBookingId === booking.id;

              return (
                <li key={booking.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.time}>
                      {formatTime(booking.scheduled_start)}
                    </span>
                    <div className={styles.who}>
                      <Link
                        className={styles.petName}
                        to={`/staff/bookings/${booking.id}?from=front-desk`}
                      >
                        {row.pet_name ?? 'Unknown pet'}
                      </Link>
                      <span className={styles.meta}>
                        {row.owner_name ?? 'Unknown owner'}
                      </span>
                    </div>
                    <div className={styles.service}>
                      <span>{booking.service_category}</span>
                      <span className={styles.meta}>
                        {row.assigned_staff_name ?? 'No staff assigned'}
                      </span>
                    </div>
                    <div className={styles.status}>
                      <span data-status={booking.status}>{booking.status}</span>
                      {row.completed_by_name ? (
                        <span className={styles.meta}>
                          by {row.completed_by_name}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.actions}>
                      {action ? (
                        <button
                          type="button"
                          className={styles.actionButton}
                          disabled={isBusy}
                          aria-label={`${ACTION_LABELS[action]} ${row.pet_name ?? 'this booking'}`}
                          onClick={() => handleAction(row, action)}
                        >
                          {isBusy ? 'Saving…' : ACTION_LABELS[action]}
                        </button>
                      ) : blockedReason ? (
                        <span className={styles.blocked}>{blockedReason}</span>
                      ) : null}
                    </div>
                  </div>

                  {checkoutBookingId === booking.id && row.stay_id ? (
                    <div className={styles.checkoutPanel}>
                      {booking.service_category === 'Hotel' ? (
                        <HotelCheckoutPanel
                          accessToken={accessToken ?? ''}
                          initialStayId={row.stay_id}
                          skippableTaskCount={row.outstanding_task_count}
                          onCheckedOut={refresh}
                        />
                      ) : (
                        <DaycareCheckoutPanel
                          accessToken={accessToken ?? ''}
                          sessionId={row.stay_id}
                          skippableTaskCount={row.outstanding_task_count}
                          onCheckedOut={refresh}
                        />
                      )}
                      <button
                        type="button"
                        className={styles.closeButton}
                        onClick={() => setCheckoutBookingId(null)}
                      >
                        Close
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmGroomRow !== null}
        title="Complete this grooming?"
        body={`${confirmGroomRow?.pet_name ?? 'This pet'} will be marked as done, under your name.`}
        confirmLabel="Complete"
        isConfirming={busyBookingId === confirmGroomRow?.booking.id}
        onConfirm={() => void completeGroom()}
        onCancel={() => setConfirmGroomRow(null)}
      />

      {vetRow ? (
        <ServicesDoneModal
          petName={vetRow.pet_name ?? 'this pet'}
          catalog={catalog}
          isSaving={busyBookingId === vetRow.booking.id}
          error={actionError}
          onConfirm={(lines) => void completeVet(lines)}
          onCancel={() => setVetRow(null)}
        />
      ) : null}

      {assessRow && accessToken ? (
        <FrontDeskAssessDialog
          petId={assessRow.booking.pet_id}
          accessToken={accessToken}
          onCancel={() => setAssessRow(null)}
          onSaved={(petName) => {
            setAssessRow(null);
            setMessage(
              `${petName} assessed - the booking now has its final price.`
            );
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
