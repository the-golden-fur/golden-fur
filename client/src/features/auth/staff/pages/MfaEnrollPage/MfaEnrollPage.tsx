import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { TotpEnrollPanel } from '../../../../../shared/components/TotpEnrollPanel/TotpEnrollPanel';

export function MfaEnrollPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  return (
    <AuthCard
      titleId="mfa-enroll-title"
      title="Set Up MFA"
      subtitle="Scan the QR code, then enter the 6-digit code from your authenticator app."
    >
      {accessToken ? (
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
