import { useCallback } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { SessionExpiryModal } from '../../../../../shared/components/SessionExpiryModal/SessionExpiryModal';
import { useInactivityTimeout } from '../../../../../shared/hooks/useInactivityTimeout/useInactivityTimeout';
import { UnavailabilityStatusBadge } from '../../../../staff/components/UnavailabilityStatusBadge/UnavailabilityStatusBadge';
import { useAuth } from '../../../providers/AuthProvider/useAuth';

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
  return role === 'Admin' || role === 'Supervisor';
}

export function StaffAuthGuard() {
  const { user, session, accessToken, isLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = getStaffRole(user ?? {});
  const thresholdMs = role ? (ROLE_TIMEOUT_MS[role] ?? null) : null;

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
  const mfaPending =
    window.sessionStorage.getItem('staffMfaPending') === 'true' ||
    (requiresMfa(role) && aal !== 'aal2');

  if (mfaPending && location.pathname !== '/staff/mfa/verify') {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

  return (
    <>
      <div style={{ padding: '1rem 1rem 0' }}>
        <UnavailabilityStatusBadge accessToken={accessToken} staffId={user.id} />
      </div>
      <Outlet />
      <SessionExpiryModal
        isOpen={isWarningVisible}
        remainingMs={remainingMs}
        onStaySignedIn={staySignedIn}
      />
    </>
  );
}
