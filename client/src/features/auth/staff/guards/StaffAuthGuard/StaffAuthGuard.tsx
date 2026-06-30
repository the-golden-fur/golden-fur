import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../../providers/AuthProvider/useAuth';

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
  const { user, session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!session || !user) {
    return <Navigate to="/staff/login" replace state={{ from: location }} />;
  }

  const role = getStaffRole(user);
  const aal = (session.user as { aal?: string } | undefined)?.aal;
  const mfaPending =
    window.sessionStorage.getItem('staffMfaPending') === 'true' ||
    (requiresMfa(role) && aal !== 'aal2');

  if (mfaPending && location.pathname !== '/staff/mfa/verify') {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

  return <Outlet />;
}
