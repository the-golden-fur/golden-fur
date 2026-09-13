import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { enrollMfa, unenrollMfa, verifyMfa } from '../../api/mfa.api';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import { totpCodeSchema } from '../../auth/mfa.validator';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { OtpInput } from '../OtpInput/OtpInput';
import styles from './TotpEnrollPanel.module.css';

interface TotpEnrollPanelProps {
  role: ThemeRole;
  accessToken: string;
  onEnrolled: () => void;
  /** Called instead of showing the enroll form when the server reports the
   * account is already enrolled (HTTP 409) - defaults to onEnrolled, since
   * that outcome should route the caller wherever a completed check-in
   * would. This is a second layer of defense: the pages that render this
   * panel are expected to check status themselves first, but a factor
   * created between that check and this call would otherwise still hit
   * `startEnroll` unconditionally. */
  onAlreadyEnrolled?: () => void;
}

export function TotpEnrollPanel({
  role,
  accessToken,
  onEnrolled,
  onAlreadyEnrolled,
}: TotpEnrollPanelProps) {
  const { applySession } = useAuth();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  // Enrolling creates a real factor server-side, so it must only ever run
  // once per mount - React 18 StrictMode's dev-mode double-invoke of this
  // effect would otherwise race two enroll() calls against each other and
  // surface as "a factor with this friendly name already exists".
  const hasStartedEnrollRef = useRef(false);

  const startEnroll = useCallback(async () => {
    setError(null);
    const result = await enrollMfa(role, accessToken);

    if (result.status === 409) {
      // The account already has a verified factor - never fall through to
      // showing a broken/empty enroll form or a "Start over" action here,
      // since that would unenroll-then-reenroll a working credential the
      // user never asked to reset.
      setAlreadyEnrolled(true);
      (onAlreadyEnrolled ?? onEnrolled)();
      return;
    }

    if (result.error || !result.data) {
      setError(result.error ?? 'Unable to start MFA enrollment.');
      return;
    }

    setQrCode(result.data.totp?.qr_code ?? result.data.qr_code ?? null);
    setSecret(result.data.totp?.secret ?? null);
  }, [role, accessToken, onEnrolled, onAlreadyEnrolled]);

  useEffect(() => {
    if (hasStartedEnrollRef.current) {
      return;
    }

    hasStartedEnrollRef.current = true;
    void startEnroll();
  }, [startEnroll]);

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
      await applySession(result.data.access_token, result.data.refresh_token);
    }

    onEnrolled();
  };

  // Only reachable from the generic-error branch below, which (now that a
  // 409 short-circuits before this point) only happens when no verified
  // factor exists yet - so this can only ever remove an unverified one.
  const handleReset = async () => {
    setIsResetting(true);
    await unenrollMfa(role, accessToken);
    setIsResetting(false);
    setQrCode(null);
    setSecret(null);
    setCode('');
    await startEnroll();
  };

  if (alreadyEnrolled) {
    return (
      <div className={styles.panel}>
        <p className={styles.copy}>MFA is already set up for this account.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <p className={styles.copy}>
        Scan the QR code with your authenticator app, then enter the 6-digit
        code it generates.
      </p>
      {qrCode ? (
        <img
          className={styles.qrCode}
          src={qrCode}
          alt="MFA enrollment QR code"
        />
      ) : null}
      {secret ? (
        <div className={styles.manualEntry}>
          <span className={styles.label}>
            Can&apos;t scan? Enter this key manually
          </span>
          <div className={styles.secretRow}>
            <code className={styles.secret}>{secret}</code>
            <button
              className={styles.copyButton}
              type="button"
              onClick={() => void navigator.clipboard?.writeText(secret)}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
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
