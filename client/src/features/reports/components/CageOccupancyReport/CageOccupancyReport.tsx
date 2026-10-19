import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  checkOutHotelStay,
  closeCageTemporarily,
  getCageGrid,
  getCageOccupants,
  getHotelCheckoutPreview,
  reopenCage,
} from '../../../hotel/api/hotel.api';
import { CageCloseDialog } from '../../../hotel/components/CageStatusGrid/CageCloseDialog';
import {
  OVERRIDE_ROLES,
  formatClosedUntil,
  isClosedToCustomers,
} from '../../../hotel/components/CageStatusGrid/cageClosure';
import { HotelBillBreakdown } from '../../../hotel/components/HotelBillBreakdown/HotelBillBreakdown';
import {
  checkOutDaycareSession,
  getDaycareCheckoutPreview,
} from '../../../daycare/api/daycare.api';
import { DaycareBillBreakdown } from '../../../daycare/components/DaycareBillBreakdown/DaycareBillBreakdown';
import type {
  DaycareCheckoutPreview,
  DaycareCheckoutResult,
} from '../../../daycare/daycare.types';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '../../../../shared/components/Modal/Modal';
import type {
  Cage,
  CageOccupant,
  CageSize,
  CageStatus,
  CheckoutResult,
  HotelCheckoutPreview,
} from '../../../hotel/hotel.types';
import { CAGE_OCCUPANT_PAYMENT_LABEL } from '../../../hotel/hotel.types';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import { getCageOccupancyReport } from '../../api/reports.api';
import type { CageOccupancyRow } from '../../reports.types';
import { CheckoutCountdown } from './CheckoutCountdown';
import {
  buildCageComparators,
  CAGE_SIZE_ORDER,
  CAGE_SORT_OPTIONS,
  groupCagesBySize,
  type CageSortKey,
} from './cageSort';
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
  'Front Desk',
]);

const SIZE_ORDER = CAGE_SIZE_ORDER;

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
 * it for actually finding a specific cage. That individual list follows
 * the same branch as the summary: the viewer's own branch, or - for a
 * Superadmin, who isn't tied to one - whatever the branch selector says,
 * "All branches" included (each card then names its branch). Viewing only:
 * checking a pet out stays with staff of the branch it is at, so the popup
 * offers no "Check out" for a cage at another branch.
 *
 * Checkout countdown: an Occupied cage's card also shows who is in it and a
 * live countdown to the expected checkout - the booking's own scheduled end,
 * i.e. the Hotel nights / Daycare hours entered when booking (GET
 * /hotel/cages/occupants).
 *
 * Sorting and layout: besides label/status/size the list sorts by the pet
 * in the cage (checkout due, checked in, pet name, payment - cageSort.ts).
 * It is laid out as one column per cage size (groupCagesBySize), with the
 * chosen sort applied inside each column.
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
  // The bill "if checked out now", shown in the confirm dialog - Daycare's
  // or Hotel's, by the occupant's service (null while loading or when it
  // could not be worked out - checkout still works without it), and the
  // checked-out stay's bill afterwards.
  const [checkoutPreview, setCheckoutPreview] =
    useState<DaycareCheckoutPreview | null>(null);
  const [hotelPreview, setHotelPreview] = useState<HotelCheckoutPreview | null>(
    null
  );
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  // Bumped per preview request, so only the latest one's reply is kept.
  const previewRequestRef = useRef(0);
  const [daycareCheckout, setDaycareCheckout] = useState<{
    petName: string;
    cageLabel: string;
    result: DaycareCheckoutResult;
  } | null>(null);
  const [hotelCheckout, setHotelCheckout] = useState<{
    petName: string;
    cageLabel: string;
    result: CheckoutResult;
  } | null>(null);
  // Bumped after a check-out so the summary, the cage list and the
  // occupants all reload - the freed cage then reads Available everywhere.
  const [refreshKey, setRefreshKey] = useState(0);
  // Front-desk cage override: the cage the close dialog is open for, any
  // reopen error, and when the cage list was last fetched (closures are
  // judged against that, keeping render pure).
  const [closingCage, setClosingCage] = useState<Cage | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [cagesLoadedAt, setCagesLoadedAt] = useState(0);
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

    // Only a Superadmin chooses a branch ('all' = every branch); everyone
    // else leaves it to the server, which uses their own.
    const cageBranch = isSuperadmin ? selectedBranchId || 'all' : undefined;

    void getCageGrid(accessToken, cageBranch).then((result) => {
      if (!isMounted) return;

      setIsCagesLoading(false);

      if (result.error || !result.data) {
        setCagesError(result.error ?? 'Could not load individual cages.');
        return;
      }

      setCagesError(null);
      setCages(SIZE_ORDER.flatMap((size) => result.data![size]));
      setCagesLoadedAt(Date.now());
    });

    void getCageOccupants(accessToken, cageBranch).then((result) => {
      if (!isMounted || !result.data) return;

      setOccupantByCageId(
        new Map(result.data.map((occupant) => [occupant.cage_id, occupant]))
      );
    });

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isAllowedViewer,
    isSuperadmin,
    selectedBranchId,
    refreshKey,
  ]);

  const previewStayId = checkoutTarget?.occupant.stay_id ?? null;

  /** Opens the check-out confirmation for an occupied cage. The pet's bill
   * "if checked out now" (Daycare session or Hotel stay) is fetched
   * alongside - a reply for a dialog that has since been closed or reopened
   * for another pet is dropped. */
  function openCheckout(target: { cage: Cage; occupant: CageOccupant }) {
    setCheckoutError(null);
    setCheckoutMessage(null);
    setCheckoutTarget(target);
    setCheckoutPreview(null);
    setHotelPreview(null);

    const requestId = ++previewRequestRef.current;
    if (!accessToken) {
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);
    const { stay_id: stayId } = target.occupant;

    if (target.occupant.service === 'Daycare') {
      void getDaycareCheckoutPreview(stayId, accessToken).then((result) => {
        if (requestId !== previewRequestRef.current) return;
        setIsPreviewLoading(false);
        setCheckoutPreview(result.data);
      });
    } else {
      void getHotelCheckoutPreview(stayId, accessToken).then((result) => {
        if (requestId !== previewRequestRef.current) return;
        setIsPreviewLoading(false);
        setHotelPreview(result.data);
      });
    }
  }

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

    let daycareResult: DaycareCheckoutResult | null = null;
    let hotelResult: CheckoutResult | null = null;

    if (occupant.service === 'Daycare') {
      const result = await checkOutDaycareSession(
        occupant.stay_id,
        accessToken
      );
      error = result.data ? null : (result.error ?? 'Could not check out.');
      daycareResult = result.data;
      // A booked session reports what Transactions still says is owed - the
      // session's own computed_charge was mostly paid at booking.
      if (result.data?.amount_due != null) {
        amountNote = ` To collect at the cashier: PHP ${Number(result.data.amount_due).toFixed(2)}.`;
      } else if (result.data?.computed_charge != null) {
        amountNote = ` Daycare charge: PHP ${Number(result.data.computed_charge).toFixed(2)}.`;
      }
    } else {
      const result = await checkOutHotelStay(occupant.stay_id, accessToken);
      error = result.data ? null : (result.error ?? 'Could not check out.');
      hotelResult = result.data;
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
    if (daycareResult?.charge_breakdown) {
      // The whole bill, line by line, in its own popup - a one-line banner
      // can't carry the overdue hours and nights.
      setDaycareCheckout({
        petName,
        cageLabel: cage.cage_label,
        result: daycareResult,
      });
    } else if (hotelResult?.bill) {
      setHotelCheckout({
        petName,
        cageLabel: cage.cage_label,
        result: hotelResult,
      });
    } else {
      setCheckoutMessage(
        `${petName} was checked out and ${cage.cage_label} is available again.${amountNote}`
      );
    }
    setRefreshKey((key) => key + 1);
  }

  /** Front-desk cage override: close the dialog's cage to customers. Returns
   * an error message for the dialog to show, or null on success. */
  async function closeCage(minutes: number): Promise<string | null> {
    if (!accessToken || !closingCage) return null;

    const result = await closeCageTemporarily(
      closingCage.id,
      minutes,
      accessToken
    );

    if (!result.data) return result.error ?? 'Could not close the cage.';

    setRefreshKey((key) => key + 1);
    return null;
  }

  async function reopen(cage: Cage) {
    if (!accessToken) return;

    const result = await reopenCage(cage.id, accessToken);

    if (result.data) {
      setOverrideError(null);
      setRefreshKey((key) => key + 1);
    } else {
      setOverrideError(result.error ?? `Could not reopen ${cage.cage_label}.`);
    }
  }

  const cageComparators = useMemo(
    () => buildCageComparators(occupantByCageId),
    [occupantByCageId]
  );

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
    comparators: cageComparators,
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

  // With a size filter on, only that size's column is worth showing.
  const sizeColumns = groupCagesBySize(filteredCages).filter(
    (column) => sizeFilter === 'All' || column.size === sizeFilter
  );

  const branchNameById = new Map(
    branches.map((branch) => [branch.id, branch.name])
  );
  // Cages from several branches are in view at once - say which is which.
  const showCageBranch = isSuperadmin && selectedBranchId === '';
  // Checking a pet out is its own branch's job (the server refuses it from
  // any other), so the popup only offers it for the viewer's own branch.
  const canCheckOutDetailsCage =
    detailsCage !== null && detailsCage.branch_id === viewerBranchId;
  // Same own-branch rule for the front-desk override (the server closes
  // cages at the viewer's branch), and only an Available cage can be closed.
  const canOverrideDetailsCage =
    canCheckOutDetailsCage &&
    viewerRole !== null &&
    OVERRIDE_ROLES.includes(viewerRole) &&
    detailsCage?.status === 'Available';
  const detailsClosedUntil =
    detailsCage?.closed_until && isClosedToCustomers(detailsCage, cagesLoadedAt)
      ? detailsCage.closed_until
      : null;

  function renderCageCard(cage: Cage) {
    // Only an Occupied cage has someone in it - a stale occupant entry for a
    // cage that has since been freed is ignored.
    const occupant =
      cage.status === 'Occupied' ? occupantByCageId.get(cage.id) : undefined;

    return (
      <button
        key={cage.id}
        type="button"
        className={styles.cageCard}
        aria-label={`${cage.cage_label} - ${cage.status}. View details`}
        onClick={() => setDetailsCageId(cage.id)}
      >
        <span className={styles.cageLabel}>{cage.cage_label}</span>
        {showCageBranch ? (
          <span className={styles.cageSize}>
            {branchNameById.get(cage.branch_id) ?? 'Unknown branch'}
          </span>
        ) : null}
        <span className={styles.cageSize}>{SIZE_LABEL[cage.size]}</span>
        <span className={`${styles.badge} ${STATUS_TOKEN[cage.status]}`}>
          {cage.status}
        </span>
        {cage.closed_until && isClosedToCustomers(cage, cagesLoadedAt) ? (
          <span className={`${styles.badge} ${styles.closedBadge}`}>
            Closed until {formatClosedUntil(cage.closed_until, cagesLoadedAt)}
          </span>
        ) : null}
        {occupant ? (
          <span className={styles.occupant}>
            <span className={styles.occupantName}>
              {occupant.pet_name ?? 'Unknown pet'}
            </span>
            <span className={styles.cageSize}>{occupant.service}</span>
            {occupant.payment ? (
              <span className={styles.cageSize}>
                {CAGE_OCCUPANT_PAYMENT_LABEL[occupant.payment]}
              </span>
            ) : null}
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
  }

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
            <div className={styles.sizeColumns}>
              {sizeColumns.map((column) => (
                <section
                  key={column.size}
                  className={styles.sizeColumn}
                  aria-label={`${SIZE_LABEL[column.size]} cages (${column.cages.length})`}
                >
                  <h3 className={styles.sizeColumnHeading}>
                    {SIZE_LABEL[column.size]}
                    <span className={styles.sizeColumnCount}>
                      {column.cages.length}
                    </span>
                  </h3>
                  {column.cages.length === 0 ? (
                    <p className={styles.copy}>No cages</p>
                  ) : (
                    column.cages.map(renderCageCard)
                  )}
                </section>
              ))}
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
              {detailsClosedUntil ? (
                <div className={styles.detailsRow}>
                  <dt>Customers</dt>
                  <dd>
                    Closed until{' '}
                    {formatClosedUntil(detailsClosedUntil, cagesLoadedAt)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {canOverrideDetailsCage ? (
              <div className={styles.detailsActions}>
                <button
                  type="button"
                  className={styles.checkoutButton}
                  onClick={() => {
                    setOverrideError(null);
                    setClosingCage(detailsCage);
                    // One dialog at a time - the close dialog takes over.
                    setDetailsCageId(null);
                  }}
                >
                  {detailsClosedUntil
                    ? 'Change close time'
                    : 'Close to customers'}
                </button>
                {detailsClosedUntil ? (
                  <button
                    type="button"
                    className={styles.checkoutButton}
                    onClick={() => void reopen(detailsCage)}
                  >
                    Reopen now
                  </button>
                ) : null}
              </div>
            ) : null}

            {overrideError ? (
              <p className={styles.errorBanner} role="alert">
                {overrideError}
              </p>
            ) : null}

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
                  {detailsOccupant.payment ? (
                    <div className={styles.detailsRow}>
                      <dt>Payment</dt>
                      <dd>
                        {CAGE_OCCUPANT_PAYMENT_LABEL[detailsOccupant.payment]}
                      </dd>
                    </div>
                  ) : null}
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

                {canCheckOutDetailsCage ? null : (
                  <p className={styles.copy}>
                    This pet is checked out by{' '}
                    {branchNameById.get(detailsCage.branch_id) ??
                      'its own branch'}{' '}
                    staff.
                  </p>
                )}

                <div className={styles.detailsActions}>
                  {canCheckOutDetailsCage ? (
                    <button
                      type="button"
                      className={styles.checkoutButton}
                      onClick={() => {
                        openCheckout({
                          cage: detailsCage,
                          occupant: detailsOccupant,
                        });
                        // One dialog at a time - the confirm step takes over.
                        setDetailsCageId(null);
                      }}
                    >
                      Check out
                    </button>
                  ) : null}
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

      <CageCloseDialog
        key={closingCage?.id ?? 'closed'}
        cage={closingCage}
        onClose={() => setClosingCage(null)}
        onConfirm={closeCage}
      />

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
            {previewStayId && isPreviewLoading ? (
              <p className={styles.previewNote}>Working out the bill…</p>
            ) : null}
            {previewStayId && checkoutPreview ? (
              <>
                <p className={styles.previewNote}>
                  If checked out now (as of{' '}
                  {new Date(checkoutPreview.as_of).toLocaleTimeString(
                    undefined,
                    { timeStyle: 'short' }
                  )}
                  ):
                </p>
                <DaycareBillBreakdown
                  breakdown={checkoutPreview.charge_breakdown}
                  total={checkoutPreview.computed_charge}
                  bookedCharge={checkoutPreview.booked_charge}
                  addedAtCheckout={checkoutPreview.added_at_checkout}
                  amountDue={checkoutPreview.amount_due}
                />
              </>
            ) : null}
            {previewStayId && hotelPreview ? (
              <>
                <p className={styles.previewNote}>
                  If checked out now (as of{' '}
                  {new Date(hotelPreview.as_of).toLocaleTimeString(undefined, {
                    timeStyle: 'short',
                  })}
                  ):
                </p>
                <HotelBillBreakdown
                  breakdown={hotelPreview.breakdown}
                  downpaymentCollected={hotelPreview.downpayment_collected}
                  addedAtCheckout={hotelPreview.added_at_checkout}
                  amountDue={hotelPreview.amount_due}
                />
              </>
            ) : null}
            {checkoutError ? (
              <p className={styles.errorBanner} role="alert">
                {checkoutError}
              </p>
            ) : null}
          </>
        }
      />
      <Modal
        isOpen={daycareCheckout !== null}
        title={
          daycareCheckout ? `${daycareCheckout.petName} was checked out` : ''
        }
        onClose={() => setDaycareCheckout(null)}
      >
        {daycareCheckout ? (
          <div className={styles.details}>
            <p className={styles.previewNote}>
              {daycareCheckout.cageLabel} is available again.
              {daycareCheckout.result.billed_at_checkout
                ? ' The bill has been sent to the cashier.'
                : ''}
            </p>
            <DaycareBillBreakdown
              breakdown={daycareCheckout.result.charge_breakdown}
              total={daycareCheckout.result.computed_charge ?? 0}
              bookedCharge={daycareCheckout.result.booked_charge}
              addedAtCheckout={daycareCheckout.result.added_at_checkout}
              amountDue={daycareCheckout.result.amount_due}
            />
          </div>
        ) : null}
      </Modal>
      <Modal
        isOpen={hotelCheckout !== null}
        title={hotelCheckout ? `${hotelCheckout.petName} was checked out` : ''}
        onClose={() => setHotelCheckout(null)}
      >
        {hotelCheckout?.result.bill ? (
          <div className={styles.details}>
            <p className={styles.previewNote}>
              {hotelCheckout.cageLabel} is available again.
              {hotelCheckout.result.payAtCheckout
                ? ' The bill has been sent to the cashier.'
                : ''}
            </p>
            <HotelBillBreakdown
              breakdown={hotelCheckout.result.bill}
              downpaymentCollected={hotelCheckout.result.downpaymentAmount}
              addedAtCheckout={
                hotelCheckout.result.payAtCheckout
                  ? null
                  : hotelCheckout.result.extensionFee
              }
              amountDue={hotelCheckout.result.remainingBalance}
            />
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
