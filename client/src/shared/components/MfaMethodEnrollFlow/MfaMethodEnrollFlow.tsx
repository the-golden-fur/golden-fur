import { useState } from 'react';
import { TotpEnrollPanel } from '../TotpEnrollPanel/TotpEnrollPanel';
import { EmailMfaEnrollPanel } from '../EmailMfaEnrollPanel/EmailMfaEnrollPanel';
import { useToast } from '../../providers/ToastProvider/useToast';
import type { MfaMethod } from '../../auth/mfa.types';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import styles from './MfaMethodEnrollFlow.module.css';

interface MfaMethodEnrollFlowProps {
  role: ThemeRole;
  accessToken: string;
  onEnrolled: () => void;
  /** Skips the "which method" choice and enrolls this one directly - used
   * when the caller already knows (e.g. Settings' "Add email verification"
   * button, shown once the authenticator app is already set up). */
  initialMethod?: MfaMethod;
}

/**
 * The one enroll flow every entry point shares: MfaSetupModal's
 * mandatory-role popup, MfaEnrollForm's dedicated first-time page, and
 * Settings > Security's own popup. Step 1 (skipped when initialMethod is
 * given) picks a method; step 2 hands off to that method's own panel, which
 * does the actual enroll/confirm dance. A toast fires here on success/fail
 * either way - each panel keeps its own inline error banner too, this is
 * additive, not a replacement.
 */
export function MfaMethodEnrollFlow({
  role,
  accessToken,
  onEnrolled,
  initialMethod,
}: MfaMethodEnrollFlowProps) {
  const [method, setMethod] = useState<MfaMethod | null>(initialMethod ?? null);
  const { showToast } = useToast();

  const handleEnrolled = () => {
    showToast('Multi-factor authentication is now set up.', 'success');
    onEnrolled();
  };

  const handleError = (message: string) => {
    showToast(message, 'error');
  };

  if (method === null) {
    return (
      <div className={styles.choice}>
        <p className={styles.copy}>How would you like to verify?</p>
        <button
          className={styles.choiceButton}
          type="button"
          onClick={() => setMethod('authenticator')}
        >
          Authenticator app
        </button>
        <button
          className={styles.choiceButton}
          type="button"
          onClick={() => setMethod('email')}
        >
          Email
        </button>
      </div>
    );
  }

  return method === 'authenticator' ? (
    <TotpEnrollPanel
      role={role}
      accessToken={accessToken}
      onEnrolled={handleEnrolled}
      onError={handleError}
    />
  ) : (
    <EmailMfaEnrollPanel
      role={role}
      accessToken={accessToken}
      onEnrolled={handleEnrolled}
      onError={handleError}
    />
  );
}
