import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  checkOutHotelStay,
  getCageGrid,
  getCageOccupants,
} from '../../../hotel/api/hotel.api';
import { checkOutDaycareSession } from '../../../daycare/api/daycare.api';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type {
  Cage,
  CageOccupant,
  CageSize,
  CageStatus,
} from '../../../hotel/hotel.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { getCageOccupancyReport } from '../../api/reports.api';
import type { CageOccupancyRow } from '../../reports.types';
import { CheckoutCountdown } from './CheckoutCountdown';
import styles from './CageOccupancyReport.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

// Custom change (occupied/vacant cages view for Receptionist): opened to
// Receptionist too - server-side CAGE_OCCUPANCY_READ_ROLES
// (reports.types.ts) grants the matching GET /reports/cage-occupancy access.
const ALLOWED_VIEWER_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
  'Receptionist',
]);

const SIZE_ORDER: CageOccupancyRow['size'][] = ['S', 'M', 'L', 'XL'];

const SIZE_LABEL: Record<CageOccupancyRow['size'], string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
};

const STATUS_TOKEN: Record<CageOccupancyRow['status'], string> = {
  Available: styles.statusAvailable,
  Occupied: styles.statusOccupied,
  Reserved: styles.statusReserved,
  'Under Maintenance': styles.statusMaintenance,
};

const STATUS_FILTER_OPTIONS: Array<CageStatus | 'All'> = [
  'All',
  'Available',
  'Occupied',
  'Reserved',
  'Under Maintenance',
];

function formatExpectedCheckout(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type CageSortKey = 'label' | 'status' | 'size';

const CAGE_SORT_OPTIONS: Array<{ value: CageSortKey; label: string }> = [
  { value: 'label', label: 'Sort: Label (A-Z)' },
  { value: 'status', label: 'Sort: Status' },
  { value: 'size', label: 'Sort: Size' },
];

/**
 * Issue #105: real-time cage occupancy view, grouped by size category and
 * reusing the existing --color-cage-status-* token set (Sprint 4 Epic A,
 * #79) unchanged - the same visual language as the Hotel module's own cage
 * grid rather than a report-specific palette.
 *
 * Custom change (search/sort/filter): the per-size summary above stays as
 * the at-a-glance count view; a searchable/sortable/filterable list of
 * individual cages (reusing GET /hotel/cages, already open to every role
 * that can reach this page - see CageStatusGrid's own use of it) sits below
 * it for actually finding a specific cage. That individual list is always
 * scoped to the viewer's own branch (GET /hotel/cages has no branch
 * override) - Superadmin's branch selector above only affects the summary;
 * checking a specific cage in a different branch is still Hotel Queue's or
 * Admin > Cages' job, same as before this change.
 *
 * Checkout countdown: an Occupied cage's card also shows who is in it and a
 * live countdown to the expected checkout - the booking's own scheduled end,
 * i.e. the Hotel nights / Daycare hours entered when booking (GET
 * /hotel/cages/occupants).
 *
 * Cage details popup: every cage card is a button that opens a popup with
 * the cage's own details (status, size, pet types) and, for an occupied
 * one, the occupant (pet, owner, service, check-in time, expected checkout
 * + countdown), a link to the booking and "Check out". Check out sits
 * behind a confirm dialog and runs that pet's own Daycare/Hotel check-out,
 * which is what frees the cage back to Available.
 */
export function CageOccupancyReport() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [rows, setRows] = useState<CageOccupancyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cages, setCages] = useState<Cage[]>([]);
  const [isCagesLoading, setIsCagesLoading] = useState(true);
  const [cagesError, setCagesError] = useState<string | null>(null);
  // Who is in each occupied cage (keyed by cage id), for the booking line
  // and checkout countdown on its card. Best-effort: if this lookup fails
  // the cage list itself still renders, just without that extra line.
  const [occupantByCageId, setOccupantByCageId] = useState<
    Map<string, CageOccupant>
  >(new Map());
  // The cage whose details popup is open (by id, so the popup always shows
  // the freshest cage/occupant after a reload), or null.
  const [detailsCageId, setDetailsCageId] = useState<string | null>(null);
  // Check-out from an occupied cage's details: the cage/occupant the confirm
  // dialog is open for, the in-flight flag, and the outcome banner.
  const [checkoutTarget, setCheckoutTarget] = useState<{
    cage: Cage;
    occupant: CageOccupant;
  } | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  // Bumped after a check-out so the summary, the cage list and the
  // occupants all reload - the freed cage then reads Available everywhere.
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<CageStatus | 'All'>('All');
  const [sizeFilter, setSizeFilter] = useState<CageSize | 'All'>('All');

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

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);
  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    const branchId = isSuperadmin ? selectedBranchId || null : viewerBranchId;

    void getCageOccupancyReport(branchId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setRows(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isAllowedViewer,
    isSuperadmin,
    selectedBranchId,
    viewerBranchId,
    refreshKey,
  ]);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void getCageGrid(accessToken).then((result) => {
      if (!isMounted) return;

      setIsCagesLoading(false);

      if (result.error || !result.data) {
        setCagesError(result.error ?? 'Could not load individual cages.');
        return;
      }

      setCagesError(null);
      setCages(SIZE_ORDER.flatMap((size) => result.data![size]));
    });

    void getCageOccupants(accessToken).then((result) => {
      if (!isMounted || !result.data) return;

      setOccupantByCageId(
        new Map(result.data.map((occupant) => [occupant.cage_id, occupant]))
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer, refreshKey]);

  /** Checks the pet out through its own service's check-out (Daycare
   * session / Hotel stay) - the server releases the cage back to Available
   * as part of that, so nothing here sets a cage status directly. */
  async function confirmCheckout() {
    if (!accessToken || !checkoutTarget) return;

    const { cage, occupant } = checkoutTarget;
    const petName = occupant.pet_name ?? 'The pet';

    setIsCheckingOut(true);
    setCheckoutError(null);

    let amountNote = '';
    let error: string | null;

    if (occupant.service === 'Daycare') {
      const result = await checkOutDaycareSession(
        occupant.stay_id,
        accessToken
      );
      error = result.data ? null : (result.error ?? 'Could not check out.');
      if (result.data?.computed_charge != null) {
        amountNote = ` Daycare charge: PHP ${Number(result.data.computed_charge).toFixed(2)}.`;
      }
    } else {
      const result = await checkOutHotelStay(occupant.stay_id, accessToken);
      error = result.data ? null : (result.error ?? 'Could not check out.');
      if (result.data) {
        amountNote = ` Remaining balance: PHP ${result.data.remainingBalance.toFixed(2)}.`;
      }
    }

    setIsCheckingOut(false);

    if (error) {
      setCheckoutError(error);
      return;
    }

    setCheckoutTarget(null);
    setCheckoutMessage(
      `${petName} was checked out and ${cage.cage_label} is available again.${amountNote}`
    );
    setRefreshKey((key) => key + 1);
  }

  const preFilteredCages = useMemo(
    () =>
      cages.filter(
        (cage) =>
          (statusFilter === 'All' || cage.status === statusFilter) &&
          (sizeFilter === 'All' || cage.size === sizeFilter)
      ),
    [cages, statusFilter, sizeFilter]
  );

  const {
    search: cageSearch,
    setSearch: setCageSearch,
    sortKey: cageSortKey,
    setSortKey: setCageSortKey,
    result: filteredCages,
  } = useSearchAndSort<Cage, CageSortKey>({
    items: preFilteredCages,
    matchesQuery: (cage, query) =>
      cage.cage_label.toLowerCase().includes(query),
    comparators: {
      label: (a, b) => a.cage_label.localeCompare(b.cage_label),
      status: (a, b) => a.status.localeCompare(b.status),
      size: (a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size),
    },
    initialSortKey: 'label',
  });

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const detailsCage = detailsCageId
    ? (cages.find((cage) => cage.id === detailsCageId) ?? null)
    : null;
  const detailsOccupant =
    detailsCage?.status === 'Occupied'
      ? (occupantByCageId.get(detailsCage.id) ?? null)
      : null;

  const bySize = SIZE_ORDER.map((size) => ({
    size,
    rows: rows.filter((row) => row.size === size),
  }));

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <h1 className={styles.title}>Cage Occupancy</h1>

        {isSuperadmin ? (
          <label className={styles.field}>
            Branch
            <select
              className={styles.control}
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Loading cage occupancy..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : (
        <div className={styles.grid}>
          {bySize.map(({ size, rows: sizeRows }) => (
            <div key={size} className={styles.sizeGroup}>
              <h2 className={styles.sizeTitle}>{SIZE_LABEL[size]}</h2>
              <div className={styles.badges}>
                {sizeRows.length === 0 ? (
                  <span className={styles.copy}>No cages</span>
                ) : (
                  sizeRows.map((row) => (
                    <span
                      key={row.status}
                      className={`${styles.badge} ${STATUS_TOKEN[row.status]}`}
                    >
                      {row.status}: {row.cage_count}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className={styles.sectionTitle}>Find a cage</h2>

      {checkoutMessage ? (
        <p className={styles.successBanner} role="status">
          {checkoutMessage}
        </p>
      ) : null}

      <div className={styles.controls}>
        <SearchSortBar
          searchValue={cageSearch}
          onSearchChange={setCageSearch}
          searchPlaceholder="Search by cage label..."
          sortValue={cageSortKey}
          onSortChange={setCageSortKey}
          sortOptions={CAGE_SORT_OPTIONS}
        />

        <label className={styles.field}>
          Status
          <select
            className={styles.control}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as CageStatus | 'All')
            }
          >
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === 'All' ? 'All statuses' : status}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Size
          <select
            className={styles.control}
            value={sizeFilter}
            onChange={(event) =>
              setSizeFilter(event.target.value as CageSize | 'All')
            }
          >
            <option value="All">All sizes</option>
            {SIZE_ORDER.map((size) => (
              <option key={size} value={size}>
                {SIZE_LABEL[size]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isCagesLoading ? (
        <LoadingState label="Loading cages..." />
      ) : cagesError ? (
        <p className={styles.errorBanner} role="alert">
          {cagesError}
        </p>
      ) : (
        <>
          <p className={styles.copy}>
            {filteredCages.length} of {cages.length} cages
          </p>
          {filteredCages.length === 0 ? (
            <p className={styles.copy}>No cages match these filters.</p>
          ) : (
            <div className={styles.cageList}>
              {filteredCages.map((cage) => {
                // Only an Occupied cage has someone in it - a stale
                // occupant entry for a cage that has since been freed is
                // ignored.
                const occupant =
                  cage.status === 'Occupied'
                    ? occupantByCageId.get(cage.id)
                    : undefined;

                return (
                  <button
                    key={cage.id}
                    type="button"
                    className={styles.cageCard}
                    aria-label={`${cage.cage_label} - ${cage.status}. View details`}
                    onClick={() => setDetailsCageId(cage.id)}
                  >
                    <span className={styles.cageLabel}>{cage.cage_label}</span>
                    <span className={styles.cageSize}>
                      {SIZE_LABEL[cage.size]}
                    </span>
                    <span
                      className={`${styles.badge} ${STATUS_TOKEN[cage.status]}`}
                    >
                      {cage.status}
                    </span>
                    {occupant ? (
                      <span className={styles.occupant}>
                        <span className={styles.occupantName}>
                          {occupant.pet_name ?? 'Unknown pet'}
                        </span>
                        <span className={styles.cageSize}>
                          {occupant.service}
                        </span>
                        {occupant.expected_checkout_at ? (
                          <CheckoutCountdown
                            expectedCheckoutAt={occupant.expected_checkout_at}
                            overdueFeePerHour={occupant.overdue_fee_per_hour}
                            overdueGraceMinutes={occupant.overdue_grace_minutes}
                          />
                        ) : (
                          <span className={styles.cageSize}>
                            No expected checkout (walk-in)
                          </span>
                        )}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <Modal
        isOpen={detailsCage !== null}
        title={detailsCage ? `Cage ${detailsCage.cage_label}` : ''}
        onClose={() => setDetailsCageId(null)}
      >
        {detailsCage ? (
          <div className={styles.details}>
            <dl className={styles.detailsList}>
              <div className={styles.detailsRow}>
                <dt>Status</dt>
                <dd>
                  <span
                    className={`${styles.badge} ${STATUS_TOKEN[detailsCage.status]}`}
                  >
                    {detailsCage.status}
                  </span>
                </dd>
              </div>
              <div className={styles.detailsRow}>
                <dt>Size</dt>
                <dd>{SIZE_LABEL[detailsCage.size]}</dd>
              </div>
              <div className={styles.detailsRow}>
                <dt>Suitable for</dt>
                <dd>{detailsCage.pet_types.join(', ') || 'Not set'}</dd>
              </div>
            </dl>

            {detailsOccupant ? (
              <>
                <h3 className={styles.detailsHeading}>Current occupant</h3>
                <dl className={styles.detailsList}>
                  <div className={styles.detailsRow}>
                    <dt>Pet</dt>
                    <dd>{detailsOccupant.pet_name ?? 'Unknown pet'}</dd>
                  </div>
                  <div className={styles.detailsRow}>
                    <dt>Owner</dt>
                    <dd>{detailsOccupant.owner_name ?? 'Unknown'}</dd>
                  </div>
                  <div className={styles.detailsRow}>
                    <dt>Service</dt>
                    <dd>{detailsOccupant.service}</dd>
                  </div>
                  <div className={styles.detailsRow}>
                    <dt>Checked in</dt>
                    <dd>
                      {detailsOccupant.since
                        ? formatExpectedCheckout(detailsOccupant.since)
                        : 'Unknown'}
                    </dd>
                  </div>
                  <div className={styles.detailsRow}>
                    <dt>Expected checkout</dt>
                    <dd>
                      {detailsOccupant.expected_checkout_at
                        ? formatExpectedCheckout(
                            detailsOccupant.expected_checkout_at
                          )
                        : 'None set (walk-in with no booking)'}
                    </dd>
                  </div>
                </dl>

                {detailsOccupant.expected_checkout_at ? (
                  <p className={styles.detailsCountdown}>
                    <CheckoutCountdown
                      expectedCheckoutAt={detailsOccupant.expected_checkout_at}
                      overdueFeePerHour={detailsOccupant.overdue_fee_per_hour}
                      overdueGraceMinutes={
                        detailsOccupant.overdue_grace_minutes
                      }
                    />
                  </p>
                ) : null}

                <div className={styles.detailsActions}>
                  <button
                    type="button"
                    className={styles.checkoutButton}
                    onClick={() => {
                      setCheckoutError(null);
                      setCheckoutMessage(null);
                      setCheckoutTarget({
                        cage: detailsCage,
                        occupant: detailsOccupant,
                      });
                      // One dialog at a time - the confirm step takes over.
                      setDetailsCageId(null);
                    }}
                  >
                    Check out
                  </button>
                  {detailsOccupant.booking_id ? (
                    <Link
                      className={styles.detailsLink}
                      to={`/staff/bookings/${detailsOccupant.booking_id}`}
                    >
                      View booking
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <p className={styles.copy}>
                {detailsCage.status === 'Occupied'
                  ? 'This cage is marked Occupied, but no checked-in pet was found for it.'
                  : detailsCage.status === 'Under Maintenance'
                    ? 'This cage is under maintenance and cannot be assigned.'
                    : 'No pet is in this cage.'}
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={checkoutTarget !== null}
        title={`Check out ${checkoutTarget?.occupant.pet_name ?? 'this pet'}?`}
        confirmLabel="Check out"
        cancelLabel="Not yet"
        isConfirming={isCheckingOut}
        onCancel={() => {
          setCheckoutTarget(null);
          setCheckoutError(null);
        }}
        onConfirm={() => void confirmCheckout()}
        body={
          <>
            <p>
              This ends the {checkoutTarget?.occupant.service} stay and sets{' '}
              {checkoutTarget?.cage.cage_label} back to Available.
            </p>
            {checkoutError ? (
              <p className={styles.errorBanner} role="alert">
                {checkoutError}
              </p>
            ) : null}
          </>
        }
      />
    </main>
  );
}
