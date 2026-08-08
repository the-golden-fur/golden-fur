import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  getStaffProfile,
  listPendingUnavailabilityRequests,
  reviewUnavailabilityRequest,
} from '../../api/staff.api';
import { UnavailabilityReviewCard } from '../../components/review/UnavailabilityReviewCard/UnavailabilityReviewCard';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { ActiveFilterChips } from '../../../../shared/components/ActiveFilterChips/ActiveFilterChips';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import type { PendingUnavailabilityBlock, StaffRole } from '../../staff.types';
import styles from './UnavailabilityApprovalQueuePage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

type SortKey = 'requested-earliest' | 'start-soonest' | 'staff-name';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'requested-earliest', label: 'Sort: Requested (earliest)' },
  { value: 'start-soonest', label: 'Sort: Day off (soonest)' },
  { value: 'staff-name', label: 'Sort: Staff name (A-Z)' },
];

export function UnavailabilityApprovalQueuePage() {
  const { user, accessToken } = useAuth();

  // null = not yet known - the Supabase session carries no app-level role
  // claim, so the viewer's own staff_profiles.role has to come from the
  // server (same technique StaffAuthGuard already uses).
  const [viewerRole, setViewerRole] = useState<StaffRole | null>(null);
  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [pending, setPending] = useState<PendingUnavailabilityBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState('All');

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      if (result.data) {
        setViewerRole(result.data.role);
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

  const loadPending = (token: string) => {
    void listPendingUnavailabilityRequests(token).then((result) => {
      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load pending requests.');
        return;
      }

      setLoadError(null);
      setPending(result.data);
    });
  };

  useEffect(() => {
    if (roleStatus === 'ok' && accessToken) {
      loadPending(accessToken);
    }
  }, [roleStatus, accessToken]);

  const branchOptions = useMemo(
    () =>
      Array.from(
        new Set(
          pending
            .map((block) => block.staff?.branch_id)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [pending]
  );

  const branchFiltered = useMemo(() => {
    if (viewerRole !== 'Superadmin' || branchFilter === 'All') {
      return pending;
    }

    return pending.filter((block) => block.staff?.branch_id === branchFilter);
  }, [pending, viewerRole, branchFilter]);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: filteredPending,
  } = useSearchAndSort<PendingUnavailabilityBlock, SortKey>({
    items: branchFiltered,
    matchesQuery: (block, query) =>
      (block.staff?.display_name ?? '').toLowerCase().includes(query) ||
      (block.reason ?? '').toLowerCase().includes(query),
    comparators: {
      'requested-earliest': (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      'start-soonest': (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      'staff-name': (a, b) =>
        (a.staff?.display_name ?? '').localeCompare(
          b.staff?.display_name ?? ''
        ),
    },
    initialSortKey: 'requested-earliest',
  });

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];

    if (viewerRole === 'Superadmin' && branchFilter !== 'All') {
      chips.push({
        id: 'branch',
        label: `Branch: ${branchFilter.slice(0, 8)}`,
        onClear: () => setBranchFilter('All'),
      });
    }
    if (search.trim() !== '') {
      chips.push({
        id: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    if (sortKey !== 'requested-earliest') {
      chips.push({
        id: 'sort',
        label:
          SORT_OPTIONS.find((option) => option.value === sortKey)?.label ??
          sortKey,
        onClear: () => setSortKey('requested-earliest'),
      });
    }

    return chips;
  }, [viewerRole, branchFilter, search, sortKey, setSearch, setSortKey]);

  const handleReview = (
    block: PendingUnavailabilityBlock,
    decision: 'approved' | 'denied',
    denialReason?: string
  ) => {
    if (!accessToken) {
      return;
    }

    setActionError(null);
    // Optimistic removal; rolled back by a fresh load if the request fails.
    setPending((prev) => prev.filter((item) => item.id !== block.id));

    void reviewUnavailabilityRequest(block.staff_id, block.id, accessToken, {
      decision,
      denial_reason: denialReason,
    }).then((result) => {
      if (result.error) {
        setActionError(result.error);
        loadPending(accessToken);
      }
    });
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the approval queue.
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
        <h1 className={styles.title}>Days Off Approval Queue</h1>

        <div className={styles.toolbar}>
          {viewerRole === 'Superadmin' && branchOptions.length > 0 ? (
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

          <SearchSortBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by staff name or reason..."
            sortValue={sortKey}
            onSortChange={setSortKey}
            sortOptions={SORT_OPTIONS}
          />
        </div>

        <ActiveFilterChips chips={filterChips} />

        {actionError ? (
          <p className={styles.errorBanner} role="alert">
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading pending requests...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : filteredPending.length === 0 ? (
          <p className={styles.copy}>
            {branchFiltered.length === 0
              ? 'No pending requests.'
              : 'No requests match your search - try clearing it.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {filteredPending.map((block) => (
              <UnavailabilityReviewCard
                key={block.id}
                block={block}
                onApprove={() => handleReview(block, 'approved')}
                onDeny={(denialReason) =>
                  handleReview(block, 'denied', denialReason)
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
