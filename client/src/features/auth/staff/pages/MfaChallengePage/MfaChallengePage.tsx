import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { TotpChallengeForm } from '../../../../../shared/components/TotpChallengeForm/TotpChallengeForm';

/**
 * Consolidated onto the shared TotpChallengeForm (like
 * CustomerMfaChallengePage already did) rather than keeping the
 * near-duplicate staff-only MfaChallengeForm around - both rendered the same
 * OtpInput + verify dance, and "other ways to verify" / "remember this
 * device" only need to be built once.
 */
export function MfaChallengePage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  return (
    <AuthCard
      titleId="mfa-challenge-title"
      title="Verify MFA"
      subtitle="Verify your identity to continue."
    >
      <TotpChallengeForm
        role="staff"
        accessToken={accessToken ?? ''}
        onVerified={() => {
          window.sessionStorage.removeItem('staffMfaPending');
          navigate('/staff', { replace: true });
        }}
      />
    </AuthCard>
  );
}
