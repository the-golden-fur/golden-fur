import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  listPendingUnavailabilityRequests,
  listStaff,
} from '../../api/staff.api';
import { StaffCard } from '../../components/cards/StaffCard/StaffCard';
import { CreateStaffAccountForm } from '../../components/forms/CreateStaffAccountForm/CreateStaffAccountForm';
import { ManageStaffAccountForm } from '../../components/forms/ManageStaffAccountForm/ManageStaffAccountForm';
import { UnavailabilityBlockForm } from '../../components/forms/UnavailabilityBlockForm/UnavailabilityBlockForm';
import type {
  CreateStaffAccountResult,
  StaffProfile,
  StaffRole,
} from '../../staff.types';
import styles from './AdminStaffListPage.module.css';

const ALL_ROLES: StaffRole[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

export function AdminStaffListPage() {
  const { user, accessToken } = useAuth();

  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'All'>('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [expandedManageStaffId, setExpandedManageStaffId] = useState<
    string | null
  >(null);
  const [blockRefreshKeys, setBlockRefreshKeys] = useState<
    Record<string, number>
  >({});
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load staff.');
        return;
      }

      setStaffList(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  // The Supabase session's user.role is the Postgres role ("authenticated"
  // for every signed-in user), not the app-level staff role, and no
  // app_metadata claim carries it either - so the viewer's own role is
  // read off their own row in the already-fetched staff list instead.
  // GET /staff is reachable by every staff role and always includes the
  // requester's own row (branch-scoped or, for Superadmin, unfiltered).
  const viewer = staffList.find((staff) => staff.id === user?.id) ?? null;
  const viewerRole = viewer?.role ?? null;
  const isAllowedViewer = ALLOWED_VIEWER_ROLES.has(viewerRole ?? '');

  useEffect(() => {
    if (!isAllowedViewer || !accessToken) {
      return;
    }

    let isMounted = true;

    void listPendingUnavailabilityRequests(accessToken).then((result) => {
      if (isMounted && result.data) {
        setPendingCount(result.data.length);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isAllowedViewer, accessToken]);

  const branchOptions = useMemo(
    () => Array.from(new Set(staffList.map((staff) => staff.branch_id))),
    [staffList]
  );

  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => {
      if (roleFilter !== 'All' && staff.role !== roleFilter) {
        return false;
      }

      if (
        viewerRole === 'Superadmin' &&
        branchFilter !== 'All' &&
        staff.branch_id !== branchFilter
      ) {
        return false;
      }

      return true;
    });
  }, [staffList, roleFilter, branchFilter, viewerRole]);

  const handleBlockCreated = (staffId: string) => {
    setBlockRefreshKeys((prev) => ({
      ...prev,
      [staffId]: (prev[staffId] ?? 0) + 1,
    }));
    setBlockMessage('Unavailability block created.');
    setExpandedStaffId(null);
  };

  const handleAccountCreated = (result: CreateStaffAccountResult) => {
    setStaffList((prev) => [...prev, result.staff]);
  };

  const handleAccountManaged = (updated: StaffProfile) => {
    setStaffList((prev) =>
      prev.map((staff) => (staff.id === updated.id ? updated : staff))
    );
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the staff directory.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading staff...</p>
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

  // Only decided once loading has resolved, so an Admin/Superadmin never
  // flashes through this redirect while their own role is still unknown.
  if (!isAllowedViewer) {
    return <Navigate to="/staff/profile" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Staff Directory</h1>

      <Link to="/staff/admin/unavailability" className={styles.queueLink}>
        Unavailability approval queue
        {pendingCount ? (
          <span className={styles.queueBadge}>{pendingCount}</span>
        ) : null}
      </Link>

      <section className={styles.panel} aria-labelledby="create-staff-title">
        <h2 className={styles.sectionTitle} id="create-staff-title">
          Create staff account
        </h2>
        {viewerRole ? (
          <CreateStaffAccountForm
            accessToken={accessToken}
            viewerRole={viewerRole}
            viewerBranchId={viewer?.branch_id ?? ''}
            branchOptions={branchOptions}
            onCreated={handleAccountCreated}
          />
        ) : null}
      </section>

      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Role</span>
          <select
            className={styles.filterSelect}
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as StaffRole | 'All')
            }
          >
            <option value="All">All roles</option>
            {ALL_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        {viewerRole === 'Superadmin' ? (
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Branch</span>
            <select
              className={styles.filterSelect}
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
            >
              <option value="All">All branches</option>
              {branchOptions.map((branchId) => (
                <option key={branchId} value={branchId}>
                  {`Branch ${branchId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {blockMessage ? (
        <p className={styles.successBanner}>{blockMessage}</p>
      ) : null}

      {filteredStaff.length === 0 ? (
        <p className={styles.copy}>
          No staff members match the selected filters.
        </p>
      ) : (
        <div className={styles.grid}>
          {filteredStaff.map((staff) => (
            <div className={styles.gridItem} key={staff.id}>
              <StaffCard
                staffId={staff.id}
                profile={staff}
                accessToken={accessToken}
                refreshKey={blockRefreshKeys[staff.id]}
              />
              <button
                type="button"
                className={styles.manageButton}
                onClick={() =>
                  setExpandedStaffId((current) =>
                    current === staff.id ? null : staff.id
                  )
                }
              >
                {expandedStaffId === staff.id ? 'Close' : 'Set unavailability'}
              </button>
              {expandedStaffId === staff.id ? (
                <UnavailabilityBlockForm
                  staffId={staff.id}
                  accessToken={accessToken}
                  onCreated={() => handleBlockCreated(staff.id)}
                />
              ) : null}
              <button
                type="button"
                className={styles.manageButton}
                onClick={() =>
                  setExpandedManageStaffId((current) =>
                    current === staff.id ? null : staff.id
                  )
                }
              >
                {expandedManageStaffId === staff.id
                  ? 'Close'
                  : 'Manage account'}
              </button>
              {expandedManageStaffId === staff.id && viewerRole ? (
                <ManageStaffAccountForm
                  staffId={staff.id}
                  profile={staff}
                  viewerRole={viewerRole}
                  branchOptions={branchOptions}
                  accessToken={accessToken}
                  onUpdated={handleAccountManaged}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
