import { useState } from 'react';
import { mfaVerify } from '../../api/staffAuth.api';
import { MfaChallengeForm } from '../../components/forms/MfaChallengeForm/MfaChallengeForm';

export function MfaChallengePage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (code: string) => {
    const result = await mfaVerify({ code });

    if (result.error) {
      setError('Invalid verification code.');
      setSuccess(false);
      return;
    }

    setError(null);
    setSuccess(true);
  };

  return (
    <MfaChallengeForm onSubmit={handleSubmit} error={error} success={success} />
  );
}
