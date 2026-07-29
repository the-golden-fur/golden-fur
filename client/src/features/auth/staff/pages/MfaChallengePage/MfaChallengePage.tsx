import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { MfaChallengeForm } from '../../components/forms/MfaChallengeForm/MfaChallengeForm';

export function MfaChallengePage() {
  return (
    <AuthCard
      titleId="mfa-challenge-title"
      title="Verify MFA"
      subtitle="Enter the 6-digit code from your authenticator app."
    >
      <MfaChallengeForm />
    </AuthCard>
  );
}
