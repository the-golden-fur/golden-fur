import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  getAttendanceDay,
  getStaffProfile,
  setAttendance,
} from '../../api/staff.api';
import type {
  AttendanceDay,
  AttendanceResult,
  AttendanceRow,
  StaffAttendanceStatus,
} from '../../staff.types';
import styles from './AttendancePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);
const STATUSES: StaffAttendanceStatus[] = ['Present', 'Absent', 'Late'];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' });
}

/**
 * Who is actually in. Everyone is Present unless a Supervisor says otherwise,
 * so the page only needs touching when something changes. Absent takes
 * Groomers and Vets out of booking for the day and moves their bookings;
 * Present on a rest day puts them back in. Sick and Vacation Leave can't be
 * marked over.
 */
export function AttendancePage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [confirmAbsent, setConfirmAbsent] = useState<AttendanceRow | null>(
    null
  );
  const [result, setResult] = useState<{
    name: string;
    moved: AttendanceResult;
  } | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;
    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((profile) => {
      if (!isMounted) return;

      const role = profile.data?.role;
      setRoleStatus(role && ALLOWED_VIEWER_ROLES.has(role) ? 'ok' : 'denied');
      setIsSuperadmin(role === 'Superadmin');
      setBranchId(profile.data?.branch_id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!isSuperadmin) return;
    void listBranches().then((response) => {
      if (response.data) setBranches(response.data);
    });
  }, [isSuperadmin]);

  const load = useCallback(() => {
    if (roleStatus !== 'ok' || !accessToken || !branchId) return;

    void getAttendanceDay(branchId, date, accessToken).then((response) => {
      setLoadError(response.error);
      if (response.data) setDay(response.data);
    });
  }, [roleStatus, accessToken, branchId, date]);

  useEffect(load, [load]);

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/dashboard" replace />;
  }

  if (roleStatus === 'loading') {
    return <LoadingState />;
  }

  async function save(row: AttendanceRow, status: StaffAttendanceStatus) {
    if (!accessToken || !branchId || !day) return;

    setSavingStaffId(row.staff_id);
    setSaveError(null);
    setResult(null);

    const response = await setAttendance(
      branchId,
      row.staff_id,
      { date: day.date, status },
      accessToken
    );

    setSavingStaffId(null);
    setConfirmAbsent(null);

    if (response.error || !response.data) {
      setSaveError(response.error ?? 'Could not save attendance.');
      return;
    }

    if (status === 'Absent' && row.booking_count > 0) {
      setResult({ name: row.display_name, moved: response.data });
    }

    load();
  }

  function choose(row: AttendanceRow, status: StaffAttendanceStatus) {
    if (status === row.status) return;

    if (status === 'Absent' && row.booking_count > 0) {
      setConfirmAbsent(row);
    } else {
      void save(row, status);
    }
  }

  const isPast = day ? day.date < day.today : false;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>Attendance</h1>
          <p className={styles.copy}>
            Everyone is Present unless you change them. Absent Groomers and
            Veterinarians can't be booked that day, and their bookings move to
            someone available.
          </p>
        </header>

        <div className={styles.filters}>
          <label className={styles.field}>
            <span>Date</span>
            <input
              type="date"
              value={day?.date ?? ''}
              onChange={(event) => {
                setResult(null);
                setDate(event.target.value || undefined);
              }}
            />
          </label>
          {isSuperadmin ? (
            <label className={styles.field}>
              <span>Branch</span>
              <select
                value={branchId ?? ''}
                onChange={(event) => setBranchId(event.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {isPast ? (
          <p className={styles.copy}>Past attendance can't be changed.</p>
        ) : null}
        {loadError || saveError ? (
          <p className={styles.errorBanner} role="alert">
            {saveError ?? loadError}
          </p>
        ) : null}

        {result ? (
          <div className={styles.result} role="status">
            <p>
              {result.name} is absent. {result.moved.reassigned.length}{' '}
              {result.moved.reassigned.length === 1 ? 'booking' : 'bookings'}{' '}
              moved to other staff.
            </p>
            {result.moved.needs_rescheduling.length > 0 ? (
              <>
                <p className={styles.resultWarning}>
                  Nobody is available for these, so they need rescheduling:
                </p>
                <ul>
                  {result.moved.needs_rescheduling.map((booking) => (
                    <li key={booking.booking_id}>
                      <Link to={`/staff/bookings/${booking.booking_id}`}>
                        {booking.pet_name ?? 'Booking'} -{' '}
                        {booking.service_category},{' '}
                        {formatTime(booking.scheduled_start)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        {day ? (
          <ul className={styles.list}>
            {day.rows.map((row) => {
              const isSelf = row.staff_id === user?.id;
              const isSaving = savingStaffId === row.staff_id;

              return (
                <li key={row.staff_id} className={styles.row}>
                  <div className={styles.who}>
                    <span className={styles.name}>{row.display_name}</span>
                    <span className={styles.meta}>
                      {row.role}
                      {row.leave_type ? ` · ${row.leave_type}` : ''}
                      {row.booking_count > 0
                        ? ` · ${row.booking_count} to start`
                        : ''}
                    </span>
                  </div>

                  {row.locked ? (
                    <span className={styles.locked}>{row.leave_type}</span>
                  ) : isPast || isSelf ? (
                    <span className={styles.locked}>
                      {row.status ?? row.leave_type}
                    </span>
                  ) : (
                    <div
                      className={styles.choices}
                      role="group"
                      aria-label={`Attendance for ${row.display_name}`}
                    >
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={styles.choice}
                          aria-pressed={row.status === status}
                          disabled={isSaving}
                          onClick={() => choose(row, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : loadError ? null : (
          <LoadingState />
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmAbsent !== null}
        title={`Mark ${confirmAbsent?.display_name ?? 'this person'} absent?`}
        body={`${confirmAbsent?.booking_count ?? 0} of their bookings will move to other available staff, and those customers will be told. Marking them Present again won't move the bookings back.`}
        confirmLabel="Mark absent"
        isConfirming={savingStaffId === confirmAbsent?.staff_id}
        onConfirm={() => {
          if (confirmAbsent) void save(confirmAbsent, 'Absent');
        }}
        onCancel={() => setConfirmAbsent(null)}
      />
    </div>
  );
}
