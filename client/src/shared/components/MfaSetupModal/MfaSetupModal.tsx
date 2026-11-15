import { useState } from 'react';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { MfaMethodEnrollFlow } from '../MfaMethodEnrollFlow/MfaMethodEnrollFlow';
import styles from './MfaSetupModal.module.css';

interface MfaSetupModalProps {
  isOpen: boolean;
  role: ThemeRole;
  accessToken: string;
  onEnrolled: () => void;
  /** "Maybe later" - `dontShowAgain` is the checkbox's state at the time. */
  onDismiss: (dontShowAgain: boolean) => void;
}

/**
 * Login reminder for a default-on MFA role that hasn't enrolled yet (see
 * StaffAuthGuard). MFA is optional, so this is dismissible: "Maybe later"
 * hides it for the rest of the session, and ticking "Don't show this again"
 * stops it for good on this browser.
 */
export function MfaSetupModal({
  isOpen,
  role,
  accessToken,
  onEnrolled,
  onDismiss,
}: MfaSetupModalProps) {
  const [step, setStep] = useState<'prompt' | 'enroll'>('prompt');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      aria-label="Multi-factor authentication reminder"
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-setup-title"
      >
        <p className={styles.eyebrow}>Recommended for your role</p>
        <h2 id="mfa-setup-title" className={styles.title}>
          Turn on multi-factor authentication
        </h2>

        {step === 'prompt' ? (
          <>
            <p className={styles.copy}>
              Your role has access to sensitive settings and records. Adding an
              authenticator app (like Google Authenticator) means a stolen
              password alone can't get into your account. You can also do this
              later from Settings &gt; Security.
            </p>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(event) => setDontShowAgain(event.target.checked)}
              />
              Don't show this again
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onDismiss(dontShowAgain)}
              >
                Maybe later
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setStep('enroll')}
              >
                Set up now
              </button>
            </div>
          </>
        ) : (
          <>
            {/* A default-on role's first factor must always be a real
                authenticator app, since the server never learns that secret
                (unlike 'email' - see mfa_factor_methods' migration comment
                on why that's a materially weaker guarantee for the
                highest-privilege roles). Skips the method choice entirely
                rather than letting them pick 'email' as their only factor. */}
            <MfaMethodEnrollFlow
              role={role}
              accessToken={accessToken}
              onEnrolled={onEnrolled}
              initialMethod="authenticator"
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onDismiss(dontShowAgain)}
              >
                Maybe later
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
