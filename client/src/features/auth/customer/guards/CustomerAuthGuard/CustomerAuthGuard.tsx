import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../../../../shared/api/mfa.api';
import { getSessionAal } from '../../../../../shared/auth/api/auth.api';

export function CustomerAuthGuard() {
  const { user, session, accessToken, isLoading } = useAuth();
  const location = useLocation();

  // null = not yet known. MFA is optional for customers, but once they've
  // turned it on it must be challenged on every login, not just offered at
  // setup time - mirrors StaffAuthGuard's status fetch.
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session || !accessToken) {
      return;
    }

    let isMounted = true;

    void getMfaStatus('customer', accessToken).then((result) => {
      if (isMounted) {
        setMfaEnrolled(result.data?.mfa_enrolled ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, accessToken]);

  if (isLoading) {
    return null;
  }

  if (!session || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const aal = getSessionAal(session);
  const sessionFlagPending =
    window.sessionStorage.getItem('customerMfaPending') === 'true';
  const needsAal2 = mfaEnrolled === true && aal !== 'aal2';

  if (
    (sessionFlagPending || needsAal2) &&
    location.pathname !== '/portal/mfa/verify'
  ) {
    return <Navigate to="/portal/mfa/verify" replace />;
  }

  return <Outlet />;
}
