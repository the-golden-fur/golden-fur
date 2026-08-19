import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AppShell } from '../../../../../shared/components/AppShell/AppShell';
import type { SidebarSection } from '../../../../../shared/components/Sidebar/Sidebar';
import { SessionExpiryModal } from '../../../../../shared/components/SessionExpiryModal/SessionExpiryModal';
import { MfaSetupModal } from '../../../../../shared/components/MfaSetupModal/MfaSetupModal';
import { NotificationBell } from '../../../../notifications/components/NotificationBell/NotificationBell';
import { ComposeEntryPoint } from '../../../../messaging/components/ComposeEntryPoint/ComposeEntryPoint';
import { useInactivityTimeout } from '../../../../../shared/hooks/useInactivityTimeout/useInactivityTimeout';
import { getStaffProfile } from '../../../../staff/api/staff.api';
import {
  ROLE_TO_DASHBOARD_SLUG,
  STAFF_DASHBOARD_CONFIG,
  toSidebarSections,
} from '../../../../staff/config/staffDashboard.config';
import type { StaffRole } from '../../../../staff/staff.types';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../../../../shared/api/mfa.api';
import { getSessionAal } from '../../../../../shared/auth/api/auth.api';

function isStaffRole(role: string | null): role is StaffRole {
  return Boolean(role) && role! in ROLE_TO_DASHBOARD_SLUG;
}

function buildSidebarSections(role: string | null): SidebarSection[] {
  if (!isStaffRole(role)) {
    return [];
  }

  const slug = ROLE_TO_DASHBOARD_SLUG[role];

  // Custom change (live-review): the sidebar's "Dashboard" tile is gone for
  // every role - Home now lives in the Navbar instead, as a persistent icon
  // button (mirrors the Navbar's own Settings icon), matching the customer
  // portal's own Navbar-level Home affordance.
  return toSidebarSections(STAFF_DASHBOARD_CONFIG[slug]);
}

const ROLE_TIMEOUT_MS: Record<string, number> = {
  Superadmin: 30 * 60 * 1000,
  Admin: 30 * 60 * 1000,
  Supervisor: 60 * 60 * 1000,
  Receptionist: 4 * 60 * 60 * 1000,
  Cashier: 4 * 60 * 60 * 1000,
  Groomer: 8 * 60 * 60 * 1000,
  Veterinarian: 8 * 60 * 60 * 1000,
  'Pet Assistant': 8 * 60 * 60 * 1000,
};

function requiresMfa(role: string | null) {
  return role === 'Admin' || role === 'Supervisor' || role === 'Superadmin';
}

export function StaffAuthGuard() {
  const { user, session, accessToken, isLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // null = not yet known. The Supabase session's user.role is the Postgres
  // role ("authenticated" for every signed-in user, staff or customer) and
  // app_metadata never carries an app-level role claim either - so the real
  // staff_profiles.role has to come from the server, same as mfaEnrolled
  // below.
  const [role, setRole] = useState<string | null>(null);
  // Custom change (fix): building this inline in JSX re-created every
  // section/item array on *every* re-render, for any reason - including
  // useInactivityTimeout's own once-a-second countdown tick. Sidebar's
  // per-category FLIP-reorder animation reacts to that array's identity,
  // so it was replaying (comparing stale vs fresh element positions) once
  // a second regardless of any real interaction - visibly "twitching" any
  // time those two measurements happened to straddle a scroll. Memoizing
  // on `role` keeps the array reference stable across unrelated re-renders.
  const sidebarSections = useMemo(() => buildSidebarSections(role), [role]);
  // Populated alongside role from the same getStaffProfile call, for the
  // Navbar identity chip (username · role).
  const [username, setUsername] = useState<string | null>(null);
  // null = not yet known. Drives whether an Admin/Superadmin without a TOTP
  // factor sees the mandatory setup popup instead of being redirected to a
  // challenge page that would 400 with "No TOTP factor found".
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);
  // 'loading' until getStaffProfile resolves. A customer session reaching
  // /staff directly is a valid Supabase session with no staff_profiles row -
  // GET /staff/:id 403s for it, which must be treated as "not staff" rather
  // than the same "still loading" state as role === null.
  const [profileStatus, setProfileStatus] = useState<
    'loading' | 'ok' | 'denied'
  >('loading');

  const thresholdMs = role ? (ROLE_TIMEOUT_MS[role] ?? null) : null;

  useEffect(() => {
    if (!session || !accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      if (result.data) {
        setRole(result.data.role ?? null);
        setUsername(result.data.username ?? null);
        setProfileStatus('ok');
      } else if (result.error) {
        setProfileStatus('denied');
      }
    });

    void getMfaStatus('staff', accessToken).then((result) => {
      if (isMounted) {
        setMfaEnrolled(result.data?.mfa_enrolled ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, accessToken, user?.id]);

  const handleTimeout = useCallback(() => {
    void signOut().finally(() => {
      navigate('/staff/login', { replace: true });
    });
  }, [navigate, signOut]);

  useEffect(() => {
    if (profileStatus === 'denied') {
      handleTimeout();
    }
  }, [profileStatus, handleTimeout]);

  const { isWarningVisible, remainingMs, staySignedIn } = useInactivityTimeout({
    thresholdMs,
    onTimeout: handleTimeout,
    enabled: Boolean(session && user),
  });

  if (isLoading) {
    return null;
  }

  if (!session || !user) {
    return <Navigate to="/staff/login" replace state={{ from: location }} />;
  }

  const aal = getSessionAal(session);
  const sessionFlagPending =
    window.sessionStorage.getItem('staffMfaPending') === 'true';

  // Set by StaffLoginForm right after a fresh login - always honored
  // immediately, independent of the profile/enrollment-status fetches below.
  if (sessionFlagPending && location.pathname !== '/staff/mfa/verify') {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

  if (profileStatus !== 'ok') {
    return null;
  }

  // Mandatory roles always need aal2. Everyone else only needs it once
  // they've actually enrolled (voluntarily, via Settings) - MFA being on
  // must be challenged every login regardless of whether it was forced or
  // opted into.
  const needsAal2 =
    (requiresMfa(role) || mfaEnrolled === true) && aal !== 'aal2';

  // Direct/restored sessions (no login-form flag): wait for the enrollment
  // check before deciding. Redirecting to the challenge page before knowing
  // whether a factor exists would 400 with "No TOTP factor found"; instead,
  // not-yet-enrolled Admin/Superadmin get the mandatory setup popup below.
  const showMfaSetupModal = needsAal2 && mfaEnrolled === false;

  if (
    needsAal2 &&
    mfaEnrolled === true &&
    location.pathname !== '/staff/mfa/verify'
  ) {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

  return (
    <>
      <AppShell
        role="staff"
        brandLabel="Golden Fur Staff"
        identity={
          username && role ? { primary: username, secondary: role } : null
        }
        sidebarSections={sidebarSections}
        notificationBell={
          accessToken ? (
            <NotificationBell
              accessToken={accessToken}
              notificationsHref="/staff/notifications"
            />
          ) : null
        }
        composeButton={
          accessToken ? (
            <ComposeEntryPoint accessToken={accessToken} viewerRole={role} />
          ) : null
        }
      />
      <SessionExpiryModal
        isOpen={isWarningVisible}
        remainingMs={remainingMs}
        onStaySignedIn={staySignedIn}
      />
      {accessToken ? (
        <MfaSetupModal
          isOpen={showMfaSetupModal}
          role="staff"
          accessToken={accessToken}
          onEnrolled={() => {
            window.sessionStorage.removeItem('staffMfaPending');
            setMfaEnrolled(true);
          }}
        />
      ) : null}
    </>
  );
}
