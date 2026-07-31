import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import type { BookingStatus } from '../../../booking/booking.types';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import {
  listPackages,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  QueueFilterBar,
  type QueueStatusOption,
} from '../../../../shared/components/QueueFilterBar/QueueFilterBar';
import {
  resolveDateRangePreset,
  type DateRangePreset,
} from '../../../../shared/components/QueueFilterBar/dateRangePreset';
import { SearchSortBar } from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  listGroomingQueue,
  transitionGroomingStatus,
  type GroomingTransitionTarget,
} from '../../api/grooming.api';
import { AppointmentCard } from '../../components/AppointmentCard/AppointmentCard';
import type { GroomingSession } from '../../grooming.types';
import styles from './GroomerDashboardPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Groomer',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

// Booking-status revision: the queue endpoint only ever returns bookings
// that haven't finished yet (bookings.status IN Pending/In Progress - see
// grooming.service.ts's merged listGroomingQueue), so those are the only
// two meaningful values to filter by here. The old separate "Unconfirmed
// (awaiting payment)" option is gone along with the server's now-merged
// two-function split.
const GROOMING_STATUSES: BookingStatus[] = ['Pending', 'In Progress'];
type StatusFilter = BookingStatus | 'All';
const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: 'All', label: 'All statuses' },
  ...GROOMING_STATUSES.map((status) => ({ value: status, label: status })),
];

// Issue #68 AC-5: no WebSocket/realtime infra exists anywhere in this
// codebase yet, so "refreshes without a manual reload" is implemented as
// short-interval polling - simplest option that satisfies the flow diagram's
// loop-back without introducing new client/server infrastructure.
const REFRESH_INTERVAL_MS = 15_000;

interface EnrichedSession {
  session: GroomingSession;
  petName: string;
  ownerName: string;
  breed: string | null;
  weightClass: string;
  coatType: string;
  serviceLabel: string;
  addonLabels: string[];
  specialInstructions: string | null;
}

function queueSortPosition(session: GroomingSession): number {
  if (session.queue_position != null) return session.queue_position;
  return new Date(session.booking?.scheduled_start ?? 0).getTime();
}

export function GroomerDashboardPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [sessions, setSessions] = useState<GroomingSession[]>([]);
  const [dateRangePreset, setDateRangePreset] =
    useState<DateRangePreset>('today');
  const [customDate, setCustomDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const dateRange = useMemo(
    () => resolveDateRangePreset(dateRangePreset, new Date(), customDate),
    [dateRangePreset, customDate]
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
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

    void listServices(accessToken).then((result) => {
      if (!result.data) return;
      setServiceNames((prev) => {
        const next = { ...prev };
        for (const service of result.data!) next[service.id] = service.name;
        return next;
      });
    });

    void listPackages(accessToken).then((result) => {
      if (!result.data) return;
      setServiceNames((prev) => {
        const next = { ...prev };
        for (const pkg of result.data!) next[pkg.id] = pkg.name;
        return next;
      });
    });
  }, [roleStatus, accessToken]);

  // Issue #68 AC-5: "refreshes without a manual reload" - no WebSocket/
  // realtime infra exists anywhere in this codebase yet, so this polls on a
  // short interval instead, the simplest option that doesn't introduce new
  // client/server infrastructure. Each tick's setState calls happen inside
  // a .then() callback, never synchronously in the effect body itself
  // (SlotPicker/StaffPickerList's own set-state-in-effect pattern).
  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    // Narrowed once here since a nested function declaration (unlike an
    // inline callback) loses the enclosing `!accessToken` narrowing - TS
    // otherwise widens it back to `string | null` inside handleQueueResult.
    const token = accessToken;
    let isMounted = true;

    function handleQueueResult(
      result: Awaited<ReturnType<typeof listGroomingQueue>>
    ) {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setIsLoading(false);
        setLoadError(result.error ?? 'Could not load the grooming queue.');
        return;
      }

      setLoadError(null);
      setSessions(result.data.sessions);
      setIsLoading(false);

      const petIds = new Set<string>();
      const customerIds = new Set<string>();

      for (const session of result.data.sessions) {
        if (session.booking) {
          petIds.add(session.booking.pet_id);
          customerIds.add(session.booking.customer_id);
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

    void listGroomingQueue(token, queueDateRange).then(handleQueueResult);

    const interval = setInterval(() => {
      void listGroomingQueue(token, queueDateRange).then(handleQueueResult);
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roleStatus, accessToken, dateRange.from, dateRange.to]);

  const enriched = useMemo<EnrichedSession[]>(() => {
    return [...sessions]
      .sort((a, b) => queueSortPosition(a) - queueSortPosition(b))
      .map((session) => {
        const booking = session.booking;
        const pet = booking ? pets[booking.pet_id] : undefined;
        const owner = booking ? owners[booking.customer_id] : undefined;
        const serviceId = booking?.service_id ?? booking?.package_id ?? null;

        return {
          session,
          petName: pet?.name ?? 'Unknown pet',
          ownerName: owner?.full_name ?? 'Unknown owner',
          // pets.breed (free text) was replaced by breed_id (Issue #71) -
          // resolving it to a display name here is out of this epic's scope
          // (not one of #71-78's affected files), so this card simply omits
          // the breed line for now rather than showing a raw id.
          breed: null,
          weightClass: pet?.weight_class ?? '—',
          coatType: pet?.coat_type ?? '—',
          serviceLabel: serviceId
            ? (serviceNames[serviceId] ?? 'Service')
            : 'Service',
          addonLabels: (booking?.booking_addons ?? [])
            .map((addon) => serviceNames[addon.service_id])
            .filter((name): name is string => Boolean(name)),
          specialInstructions: booking?.special_instructions ?? null,
        };
      });
  }, [sessions, pets, owners, serviceNames]);

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'All') return enriched;
    return enriched.filter(
      (item) => item.session.booking?.status === statusFilter
    );
  }, [enriched, statusFilter]);

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: visibleSessions,
  } = useSearchAndSort<EnrichedSession, 'queue' | 'pet-name'>({
    items: statusFiltered,
    matchesQuery: (item, query) =>
      item.petName.toLowerCase().includes(query) ||
      item.ownerName.toLowerCase().includes(query),
    comparators: {
      queue: (a, b) =>
        queueSortPosition(a.session) - queueSortPosition(b.session),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'queue',
  });

  const hasSessions = visibleSessions.length > 0;

  async function handleAdvance(
    sessionId: string,
    targetStatus: GroomingTransitionTarget
  ) {
    if (!accessToken) return;

    setAdvancingId(sessionId);
    setActionError(null);

    const result = await transitionGroomingStatus(
      sessionId,
      accessToken,
      targetStatus
    );

    setAdvancingId(null);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not update this appointment.');
      return;
    }

    // The transition response already carries the freshly refetched booking
    // (grooming.service.ts's transitionGroomingSessionStatus re-selects with
    // GROOMING_SESSION_SELECT), so it can replace the old session wholesale.
    const updated = result.data;
    setSessions((prev) =>
      prev.map((session) => (session.id === updated.id ? updated : session))
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load your dashboard.
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
        <h1 className={styles.title}>Grooming Queue</h1>

        <QueueFilterBar
          dateRangePreset={dateRangePreset}
          onDateRangePresetChange={setDateRangePreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          statusValue={statusFilter}
          onStatusChange={(value) => setStatusFilter(value as StatusFilter)}
          statusOptions={STATUS_OPTIONS}
        >
          <SearchSortBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by pet or owner..."
            sortValue={sortKey}
            onSortChange={setSortKey}
            sortOptions={[
              { value: 'queue', label: 'Sort: Queue order' },
              { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
            ]}
          />
        </QueueFilterBar>

        {actionError ? (
          <p className={styles.errorBanner} role="alert">
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading appointments...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : !hasSessions ? (
          <p className={styles.copy}>
            No grooming appointments match these filters.
          </p>
        ) : (
          <ul className={styles.list}>
            {visibleSessions.map((item) => (
              <AppointmentCard
                key={item.session.id}
                session={item.session}
                petName={item.petName}
                ownerName={item.ownerName}
                breed={item.breed}
                weightClass={item.weightClass}
                coatType={item.coatType}
                serviceLabel={item.serviceLabel}
                addonLabels={item.addonLabels}
                specialInstructions={item.specialInstructions}
                isAdvancing={advancingId === item.session.id}
                onAdvance={handleAdvance}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
