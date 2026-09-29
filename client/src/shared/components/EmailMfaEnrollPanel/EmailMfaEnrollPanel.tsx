import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  enrollMfa,
  requestMfaEmailCode,
  unenrollMfa,
  verifyMfa,
} from '../../api/mfa.api';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import { totpCodeSchema } from '../../auth/mfa.validator';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { OtpInput } from '../OtpInput/OtpInput';
import styles from '../TotpEnrollPanel/TotpEnrollPanel.module.css';

interface EmailMfaEnrollPanelProps {
  role: ThemeRole;
  accessToken: string;
  onEnrolled: () => void;
  /** Fires alongside the existing inline error banner - lets a parent (e.g.
   * MfaMethodEnrollFlow) also surface a toast. */
  onError?: (message: string) => void;
}

/**
 * Email counterpart to TotpEnrollPanel: the server still enrolls a real TOTP
 * factor under the hood (see mfa_factor_methods' migration comment), it just
 * computes the code itself and emails it instead of the user's own
 * authenticator app doing so - so there's no QR/secret to show here, only
 * "check your email" plus a code-entry form and a resend action.
 */
export function EmailMfaEnrollPanel({
  role,
  accessToken,
  onEnrolled,
  onError,
}: EmailMfaEnrollPanelProps) {
  const { applySession } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // Same StrictMode double-invoke guard as TotpEnrollPanel - enrolling here
  // also emails a real code, so a double call would send two.
  const hasStartedEnrollRef = useRef(false);

  const startEnroll = useCallback(async () => {
    setError(null);
    const result = await enrollMfa(role, accessToken, 'email');

    if (result.error || !result.data) {
      const message = result.error ?? 'Unable to start MFA enrollment.';
      setError(message);
      onError?.(message);
    }
  }, [role, accessToken, onError]);

  useEffect(() => {
    if (hasStartedEnrollRef.current) {
      return;
    }

    hasStartedEnrollRef.current = true;
    void startEnroll();
  }, [startEnroll]);

  const handleResend = async () => {
    setIsResending(true);
    setResendMessage(null);
    const result = await requestMfaEmailCode(role, accessToken);
    setIsResending(false);

    if (result.error) {
      setError(result.error);
      onError?.(result.error);
      return;
    }

    setResendMessage('A new code was sent to your email.');
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

    // Load-bearing, not defensive boilerplate - see TotpEnrollPanel's
    // identical comment.
    try {
      const result = await verifyMfa(role, parsed.data.code, accessToken, {
        method: 'email',
      });

      if (result.error) {
        setError(result.error);
        onError?.(result.error);
        return;
      }

      if (result.data?.access_token && result.data.refresh_token) {
        await applySession(result.data.access_token, result.data.refresh_token);
      }

      onEnrolled();
    } catch {
      const message =
        'Could not reach the server. Check your connection and try again.';
      setError(message);
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await unenrollMfa(role, accessToken, 'email');
      setCode('');
      await startEnroll();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <p className={styles.copy}>
        We emailed you a 6-digit code. Enter it below to confirm - codes expire
        quickly, so use the latest one you received.
      </p>
      {resendMessage ? <p className={styles.copy}>{resendMessage}</p> : null}
      <button
        className={styles.secondaryButton}
        type="button"
        disabled={isResending}
        onClick={() => void handleResend()}
      >
        {isResending ? 'Sending' : 'Resend code'}
      </button>
      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className={styles.field}>
          <span className={styles.label}>6-digit code</span>
          <OtpInput value={code} onChange={setCode} label="6-digit code" />
        </div>
        {error ? (
          <div>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={isResetting}
              onClick={() => void handleReset()}
            >
              {isResetting ? 'Resetting' : 'Start over'}
            </button>
          </div>
        ) : null}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Confirming' : 'Confirm MFA'}
        </button>
      </form>
    </div>
  );
}
