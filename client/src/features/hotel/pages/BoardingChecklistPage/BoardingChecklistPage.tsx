import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { getPet } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
// Daycare Queue redesign: this Hotel-feature page importing from the Daycare
// feature is a new cross-feature direction (the reverse already exists -
// DaycareCheckInPanel imports CageStatusGrid/TimeInput from Hotel) - the
// user-facing URL for "check this pet out" was deliberately kept as
// /staff/hotel/care-log?petId=... (the same shared Boarding Checklist route
// both categories already use), not a new Daycare-only page, so the checkout
// action has to live here.
import { DaycareCheckoutPanel } from '../../../daycare/pages/DaycareQueuePage/DaycareCheckoutPanel';
import { listDaycareSessions } from '../../../daycare/api/daycare.api';
import { BoardingChecklistKanban } from '../../components/BoardingChecklistKanban/BoardingChecklistKanban';
import styles from './BoardingChecklistPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Pet Assistant',
  'Groomer',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

/** Custom change: renamed from Hotel Care Log - covers Hotel AND Daycare
 * (both share the same `stays`/`care_log_entries` tables) via the Kanban
 * board's own Hotel/Daycare subtabs. Boarding Checklist Kanban redesign:
 * every allowed role now sees the same Kanban board (Pending/In Progress/
 * Completed/Missed columns, filters, actionable checkboxes) - the old
 * Admin/Supervisor/Superadmin-only end-of-day flag panel is retired, since
 * the unified board's own Pending/Missed columns already surface the same
 * "what's still outstanding" view, just with real actions attached.
 *
 * Daycare Queue redesign: also doubles as the "checked-in pet" destination
 * from the Daycare Queue (?petId=...) - scopes the board to just that pet's
 * tasks (BoardingChecklistKanban's own petId prop) and, since removing the
 * queue's per-row Check Out button left checkout with nowhere to happen,
 * adds a Check Out section here too - resolving the pet's still-Active
 * Daycare session and reusing DaycareCheckoutPanel's existing charge-
 * breakdown flow. A Hotel stay isn't checked out from here (unchanged) -
 * only Daycare's own billing needs a staff-triggered checkout action; Hotel
 * checkout stays on HotelQueuePage's own Check Out tab.
 */
export function BoardingChecklistPage() {
  const { user, accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get('petId') ?? undefined;

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [pet, setPet] = useState<Pet | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isResolvingSession, setIsResolvingSession] = useState(Boolean(petId));

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
    if (roleStatus !== 'ok' || !accessToken || !petId) return;

    let isMounted = true;

    void getPet(petId, accessToken).then((result) => {
      if (isMounted && result.data) setPet(result.data);
    });

    void listDaycareSessions(accessToken, { status: 'Active' }).then(
      (result) => {
        if (!isMounted) return;
        setIsResolvingSession(false);
        const session = (result.data ?? []).find(
          (candidate) => candidate.pet_id === petId
        );
        setActiveSessionId(session?.id ?? null);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken, petId]);

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the Boarding Checklist.
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
        {petId ? (
          <Link className={styles.backLink} to="/staff/daycare/queue">
            &larr; Back to Daycare Queue
          </Link>
        ) : null}
        <h1 className={styles.title}>
          {petId
            ? `Boarding Checklist — ${pet?.name ?? 'Pet'}`
            : 'Boarding Checklist'}
        </h1>

        {petId && !isResolvingSession && activeSessionId ? (
          <section className={styles.checkoutSection}>
            <h2 className={styles.sectionTitle}>Check out</h2>
            <DaycareCheckoutPanel
              key={activeSessionId}
              accessToken={accessToken}
              sessionId={activeSessionId}
            />
          </section>
        ) : null}

        <BoardingChecklistKanban accessToken={accessToken} petId={petId} />
      </div>
    </main>
  );
}
