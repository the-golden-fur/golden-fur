import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { TotpChallengeForm } from '../../../../../shared/components/TotpChallengeForm/TotpChallengeForm';

export function CustomerMfaChallengePage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthCard
      titleId="customer-mfa-challenge-title"
      title="Verify your identity"
      subtitle="Verify your identity to continue."
    >
      <TotpChallengeForm
        role="customer"
        accessToken={accessToken}
        onVerified={() => {
          window.sessionStorage.removeItem('customerMfaPending');
          navigate('/portal', { replace: true });
        }}
      />
    </AuthCard>
  );
}
