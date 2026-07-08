import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { enrollMfa, unenrollMfa, verifyMfa } from '../../api/mfa.api';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import { totpCodeSchema } from '../../auth/mfa.validator';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import styles from './TotpEnrollPanel.module.css';

interface TotpEnrollPanelProps {
  role: ThemeRole;
  accessToken: string;
  onEnrolled: () => void;
}

export function TotpEnrollPanel({
  role,
  accessToken,
  onEnrolled,
}: TotpEnrollPanelProps) {
  const { applySession } = useAuth();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Enrolling creates a real factor server-side, so it must only ever run
  // once per mount - React 18 StrictMode's dev-mode double-invoke of this
  // effect would otherwise race two enroll() calls against each other and
  // surface as "a factor with this friendly name already exists".
  const hasStartedEnrollRef = useRef(false);

  const startEnroll = useCallback(async () => {
    setError(null);
    const result = await enrollMfa(role, accessToken);

    if (result.error || !result.data) {
      setError(result.error ?? 'Unable to start MFA enrollment.');
      return;
    }

    setQrCode(result.data.totp?.qr_code ?? result.data.qr_code ?? null);
    setSecret(result.data.totp?.secret ?? null);
  }, [role, accessToken]);

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

  const handleReset = async () => {
    setIsResetting(true);
    await unenrollMfa(role, accessToken);
    setIsResetting(false);
    setQrCode(null);
    setSecret(null);
    setCode('');
    await startEnroll();
  };

  return (
    <div className={styles.panel}>
      <p className={styles.copy}>
        Scan the QR code with your authenticator app, then enter the 6-digit
        code it generates.
      </p>
      {qrCode ? (
        <img className={styles.qrCode} src={qrCode} alt="MFA enrollment QR code" />
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
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
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
