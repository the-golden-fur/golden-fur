import { useState, type FormEvent } from 'react';
import { verifyMfa } from '../../api/mfa.api';
import { setSessionPersistence } from '../../auth/api/auth.api';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import { totpCodeSchema } from '../../auth/mfa.validator';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { OtpInput } from '../OtpInput/OtpInput';
import styles from '../TotpEnrollPanel/TotpEnrollPanel.module.css';

interface TotpChallengeFormProps {
  role: ThemeRole;
  accessToken: string;
  onVerified: () => void;
}

/**
 * Code-entry-only counterpart to TotpEnrollPanel, for an *already enrolled*
 * factor - no QR/secret, no enroll() call. Used at login time for anyone with
 * MFA already turned on, whether they were forced to enroll (mandatory
 * roles) or opted in voluntarily via Settings.
 */
export function TotpChallengeForm({
  role,
  accessToken,
  onVerified,
}: TotpChallengeFormProps) {
  const { applySession } = useAuth();
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
    const result = await verifyMfa(role, parsed.data.code, accessToken);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.data?.access_token && result.data.refresh_token) {
      // Customers' sessions survive a browser restart; staff sessions are
      // sessionStorage-only and end when the browser closes (see auth.api.ts).
      setSessionPersistence(role === 'customer');
      await applySession(result.data.access_token, result.data.refresh_token);
    }

    onVerified();
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className={styles.field}>
        <span className={styles.label}>6-digit code</span>
        <OtpInput value={code} onChange={setCode} label="6-digit code" autoFocus />
      </div>
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
