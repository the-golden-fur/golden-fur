import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../../../../shared/api/mfa.api';
import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { TotpEnrollPanel } from '../../../../../shared/components/TotpEnrollPanel/TotpEnrollPanel';

type EnrollGateStatus = 'checking' | 'enroll' | 'already-enrolled';

export function MfaEnrollPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [gateStatus, setGateStatus] = useState<EnrollGateStatus>('checking');

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    // Reachable via a stale bookmark, the back/forward button, or a
    // duplicate tab regardless of whether this account is already
    // enrolled - re-check the authoritative status before ever showing an
    // enroll form, instead of assuming "not enrolled" just because this
    // page loaded. If the check itself fails, stay in 'checking' rather
    // than falling through to 'enroll': an unknown status is not the same
    // as "definitely not enrolled".
    void getMfaStatus('staff', accessToken).then((result) => {
      if (!isMounted) {
        return;
      }
      if (result.data) {
        setGateStatus(result.data.mfa_enrolled ? 'already-enrolled' : 'enroll');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  if (gateStatus === 'already-enrolled') {
    return <Navigate to="/staff/mfa/verify" replace />;
  }

  return (
    <AuthCard
      titleId="mfa-enroll-title"
      title="Set Up MFA"
      subtitle="Scan the QR code, then enter the 6-digit code from your authenticator app."
    >
      {accessToken && gateStatus === 'enroll' ? (
        <TotpEnrollPanel
          role="staff"
          accessToken={accessToken}
          onEnrolled={() => {
            window.sessionStorage.removeItem('staffMfaPending');
            navigate('/staff', { replace: true });
          }}
          onAlreadyEnrolled={() => {
            navigate('/staff/mfa/verify', { replace: true });
          }}
        />
      ) : null}
    </AuthCard>
  );
}
