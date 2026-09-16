import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../../../../shared/api/mfa.api';
import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { TotpEnrollPanel } from '../../../../../shared/components/TotpEnrollPanel/TotpEnrollPanel';

/**
 * Bug fix: unlike MfaSetupModal (only ever shown once StaffAuthGuard has
 * confirmed mfa_enrolled === false) and SecurityTab (same guard), this page
 * is reachable directly - a bookmark, browser back button, or re-typing the
 * URL after already completing enrollment. TotpEnrollPanel calls the enroll
 * endpoint unconditionally on mount, and enrollTotpFactor's own last-resort
 * conflict handling used to delete an existing *verified* factor as a side
 * effect (only possible once the session is already aal2, i.e. exactly the
 * "already enrolled and already verified" case) - silently invalidating
 * the authenticator app entry the user had already scanned, with no error
 * shown, well before the "MFA lockout" issue that was actually just a
 * dead-secret symptom of this. Checking status first and redirecting an
 * already-enrolled session to Verify instead closes off that path (the
 * server-side fix in supabaseAuth.api.ts's enrollTotpFactor is the other
 * half - defense in depth for any other caller of the enroll endpoint).
 */
export function MfaEnrollPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [alreadyEnrolled, setAlreadyEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    // A failed status check fails open to "not enrolled" (renders the
    // enroll panel as before) rather than blocking a genuinely new user -
    // the server-side fix means that path can no longer destroy a real
    // factor even if this check is wrong.
    void getMfaStatus('staff', accessToken).then((result) => {
      if (isMounted) {
        setAlreadyEnrolled(result.data?.mfa_enrolled ?? false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  if (alreadyEnrolled) {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

  return (
    <AuthCard
      titleId="mfa-enroll-title"
      title="Set Up MFA"
      subtitle="Scan the QR code, then enter the 6-digit code from your authenticator app."
    >
      {accessToken && alreadyEnrolled === false ? (
        <TotpEnrollPanel
          role="staff"
          accessToken={accessToken}
          onEnrolled={() => {
            window.sessionStorage.removeItem('staffMfaPending');
            navigate('/staff', { replace: true });
          }}
        />
      ) : null}
    </AuthCard>
  );
}
