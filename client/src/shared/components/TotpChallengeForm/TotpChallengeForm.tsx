import { useEffect, useState, type FormEvent } from 'react';
import {
  getMfaStatus,
  requestMfaEmailCode,
  verifyMfa,
} from '../../api/mfa.api';
import { setSessionPersistence } from '../../auth/api/auth.api';
import { storeDeviceToken } from '../../auth/api/trustedDevice.api';
import { MANDATORY_MFA_ROLES } from '../../auth/mandatoryMfaRoles';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import { totpCodeSchema } from '../../auth/mfa.validator';
import type { MfaMethod, MfaMethodStatus } from '../../auth/mfa.types';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { OtpInput } from '../OtpInput/OtpInput';
import styles from '../TotpEnrollPanel/TotpEnrollPanel.module.css';

interface TotpChallengeFormProps {
  role: ThemeRole;
  accessToken: string;
  onVerified: () => void;
}

const METHOD_LABEL: Record<MfaMethod, string> = {
  authenticator: 'authenticator app',
  email: 'email',
};

/**
 * Code-entry-only counterpart to TotpEnrollPanel, for an *already enrolled*
 * factor - no QR/secret, no enroll() call. Used at login time for anyone with
 * MFA already turned on, whether they were forced to enroll (mandatory
 * roles) or opted in voluntarily via Settings. Offers "Other ways to verify"
 * when more than one method is enrolled, and an opt-in "remember this
 * device" - hidden entirely for a mandatory-MFA role (mfaVerifyController
 * would silently no-op it anyway, since that can never produce the real
 * aal2 those roles' routes require; showing a checkbox that visibly does
 * nothing would be worse than not offering it).
 */
export function TotpChallengeForm({
  role,
  accessToken,
  onVerified,
}: TotpChallengeFormProps) {
  const { applySession } = useAuth();
  const [methods, setMethods] = useState<MfaMethodStatus | null>(null);
  const [isMandatoryRole, setIsMandatoryRole] = useState(false);
  const [method, setMethod] = useState<MfaMethod>('authenticator');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getMfaStatus(role, accessToken).then((result) => {
      if (!isMounted || !result.data) {
        return;
      }
      setMethods(result.data.methods);
      setMethod(result.data.preferred_method);
      setIsMandatoryRole(
        Boolean(result.data.role && MANDATORY_MFA_ROLES.has(result.data.role))
      );
    });

    return () => {
      isMounted = false;
    };
  }, [role, accessToken]);

  const otherMethods = (['authenticator', 'email'] as const).filter(
    (candidate) => candidate !== method && methods?.[candidate]
  );

  const switchMethod = async (nextMethod: MfaMethod) => {
    setError(null);
    setCode('');
    setMethod(nextMethod);
    setEmailCodeSent(false);

    if (nextMethod === 'email') {
      setIsSendingEmailCode(true);
      const result = await requestMfaEmailCode(role, accessToken);
      setIsSendingEmailCode(false);

      if (result.error) {
        setError(result.error);
        return;
      }
      setEmailCodeSent(true);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.');
      return;
    }

    setIsSubmitting(true);

    // Load-bearing, not defensive boilerplate - see StaffLoginForm's
    // identical comment: without it, a thrown exception (a network failure
    // inside applySession, say) skips setIsSubmitting(false) entirely,
    // leaving "Verify code" silently stuck disabled forever.
    try {
      const result = await verifyMfa(role, parsed.data.code, accessToken, {
        method,
        rememberDevice,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data?.device_token) {
        storeDeviceToken(role, result.data.device_token);
      }

      if (result.data?.access_token && result.data.refresh_token) {
        // Customers' sessions survive a browser restart; staff sessions are
        // sessionStorage-only and end when the browser closes (see
        // auth.api.ts).
        setSessionPersistence(role === 'customer');
        await applySession(result.data.access_token, result.data.refresh_token);
      }

      onVerified();
    } catch {
      setError(
        'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
    >
      {method === 'email' && emailCodeSent ? (
        <p className={styles.copy}>We emailed you a 6-digit code.</p>
      ) : null}
      <div className={styles.field}>
        <span className={styles.label}>6-digit code</span>
        <OtpInput
          value={code}
          onChange={setCode}
          label="6-digit code"
          autoFocus
        />
      </div>
      {isMandatoryRole ? null : (
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          Remember this device for 30 days
        </label>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button
        className={styles.button}
        type="submit"
        disabled={isSubmitting || isSendingEmailCode}
      >
        {isSubmitting ? 'Verifying' : 'Verify code'}
      </button>
      {otherMethods.length > 0 ? (
        <div>
          <p className={styles.copy}>Other ways to verify:</p>
          {otherMethods.map((candidate) => (
            <button
              key={candidate}
              className={styles.secondaryButton}
              type="button"
              disabled={isSendingEmailCode}
              onClick={() => void switchMethod(candidate)}
            >
              Use my {METHOD_LABEL[candidate]}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
