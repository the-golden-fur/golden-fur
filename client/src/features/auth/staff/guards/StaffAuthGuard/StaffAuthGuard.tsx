import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { SessionExpiryModal } from '../../../../../shared/components/SessionExpiryModal/SessionExpiryModal';
import { MfaSetupModal } from '../../../../../shared/components/MfaSetupModal/MfaSetupModal';
import { useInactivityTimeout } from '../../../../../shared/hooks/useInactivityTimeout/useInactivityTimeout';
import { UnavailabilityStatusBadge } from '../../../../staff/components/UnavailabilityStatusBadge/UnavailabilityStatusBadge';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../../../../shared/api/mfa.api';

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

function getStaffRole(user: { role?: string | null; app_metadata?: unknown }) {
  if (user.role) {
    return user.role;
  }

  if (
    user.app_metadata &&
    typeof user.app_metadata === 'object' &&
    'role' in user.app_metadata
  ) {
    const role = user.app_metadata.role;
    return typeof role === 'string' ? role : null;
  }

  return null;
}

function requiresMfa(role: string | null) {
  return role === 'Admin' || role === 'Superadmin';
}

export function StaffAuthGuard() {
  const { user, session, accessToken, isLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = getStaffRole(user ?? {});
  const thresholdMs = role ? (ROLE_TIMEOUT_MS[role] ?? null) : null;

  // null = not yet known. Drives whether an Admin/Superadmin without a TOTP
  // factor sees the mandatory setup popup instead of being redirected to a
  // challenge page that would 400 with "No TOTP factor found".
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session || !accessToken) {
      return;
    }

    let isMounted = true;

    void getMfaStatus('staff', accessToken).then((result) => {
      if (isMounted) {
        setMfaEnrolled(result.data?.mfa_enrolled ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, accessToken]);

  const handleTimeout = useCallback(() => {
    void signOut().finally(() => {
      navigate('/staff/login', { replace: true });
    });
  }, [navigate, signOut]);

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

  const aal = (session.user as { aal?: string } | undefined)?.aal;
  const sessionFlagPending =
    window.sessionStorage.getItem('staffMfaPending') === 'true';
  // Mandatory roles always need aal2. Everyone else only needs it once
  // they've actually enrolled (voluntarily, via Settings) - MFA being on
  // must be challenged every login regardless of whether it was forced or
  // opted into.
  const needsAal2 =
    (requiresMfa(role) || mfaEnrolled === true) && aal !== 'aal2';

  // Set by StaffLoginForm right after a fresh login - always honored
  // immediately, independent of the enrollment-status fetch below.
  if (sessionFlagPending && location.pathname !== '/staff/mfa/verify') {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

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
      <div style={{ padding: '1rem 1rem 0' }}>
        <UnavailabilityStatusBadge
          accessToken={accessToken}
          staffId={user.id}
        />
      </div>
      <Outlet />
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
