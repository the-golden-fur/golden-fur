import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { setSessionPersistence } from '../../../../../../shared/auth/api/auth.api';
import { mfaEnroll, mfaVerify } from '../../../api/staffAuth.api';
import { totpCodeSchema } from '../../../modules/validators/staffAuth.validator';
import styles from '../StaffLoginForm/StaffLoginForm.module.css';

export function MfaEnrollForm() {
  const navigate = useNavigate();
  const { accessToken, applySession } = useAuth();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [manualUri, setManualUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const enroll = async () => {
      const result = await mfaEnroll(accessToken);
      if (!isMounted) {
        return;
      }

      if (result.error || !result.data) {
        setError(result.error ?? 'Unable to start MFA enrollment.');
        return;
      }

      setQrCode(result.data.totp?.qr_code ?? result.data.qr_code ?? null);
      setManualUri(result.data.totp?.uri ?? result.data.uri ?? null);
    };

    void enroll();

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

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
      {qrCode ? <img src={qrCode} alt="MFA enrollment QR code" /> : null}
      {manualUri ? <p className={styles.success}>{manualUri}</p> : null}
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
        {isSubmitting ? 'Confirming' : 'Confirm MFA'}
      </button>
    </form>
  );
}
