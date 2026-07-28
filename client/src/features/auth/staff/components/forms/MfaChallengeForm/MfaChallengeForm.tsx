import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { setSessionPersistence } from '../../../../../../shared/auth/api/auth.api';
import { mfaVerify } from '../../../api/staffAuth.api';
import { totpCodeSchema } from '../../../modules/validators/staffAuth.validator';
import styles from '../StaffLoginForm/StaffLoginForm.module.css';

export function MfaChallengeForm() {
  const navigate = useNavigate();
  const { accessToken, applySession } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.');
      return;
    }

    setIsSubmitting(true);
    const result = await mfaVerify(parsed.data, accessToken);
    setIsSubmitting(false);

    if (result.error) {
      setError('Invalid verification code.');
      return;
    }

    if (result.data && 'access_token' in result.data) {
      setSessionPersistence(false);
      await applySession(result.data.access_token, result.data.refresh_token);
    }

    window.sessionStorage.removeItem('staffMfaPending');
    navigate('/staff', { replace: true });
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label className={styles.field}>
        <span className={styles.label}>6-digit code</span>
        <input
          className={styles.input}
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Verifying' : 'Verify code'}
      </button>
    </form>
  );
}
