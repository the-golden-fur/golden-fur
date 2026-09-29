import { useState, type FormEvent } from 'react';
import { Lock, Mail } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { setSessionPersistence } from '../../../../../../shared/auth/api/auth.api';
import { getStoredDeviceToken } from '../../../../../../shared/auth/api/trustedDevice.api';
import { MANDATORY_MFA_ROLES } from '../../../../../../shared/auth/mandatoryMfaRoles';
import { getMfaStatus } from '../../../../../../shared/api/mfa.api';
import { forgotPassword, login } from '../../../api/staffAuth.api';
import {
  forgotPasswordSchema,
  staffLoginSchema,
} from '../../../modules/validators/staffAuth.validator';
import styles from './StaffLoginForm.module.css';

function isMfaRole(role?: string | null) {
  return Boolean(role && MANDATORY_MFA_ROLES.has(role));
}

export function StaffLoginForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResetMessage(null);

    const parsed = staffLoginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your login details.');
      return;
    }

    setIsSubmitting(true);

    // Load-bearing, not defensive boilerplate: without it, a thrown
    // exception anywhere in this sequence (a network failure inside
    // applySession/getMfaStatus, say) would skip setIsSubmitting(false)
    // entirely, leaving "Sign in" silently stuck disabled forever with no
    // visible error - the reported "random freeze" on login. login() itself
    // no longer throws on a network failure either (see staffAuth.api.ts),
    // but this is the backstop for everything downstream of it.
    try {
      const deviceToken = getStoredDeviceToken('staff');
      const result = await login({
        ...parsed.data,
        ...(deviceToken ? { device_token: deviceToken } : {}),
      });

      if (result.error || !result.data) {
        setError('Invalid username or password.');
        return;
      }

      // Staff sessions are sessionStorage-only - closing the browser signs
      // them out even if a customer session on the same browser had
      // persistence turned on.
      setSessionPersistence(false);
      await applySession(result.data.access_token, result.data.refresh_token);

      // A valid trusted-device token was honored server-side - skip the MFA
      // redirect entirely (see mfaVerifyController for why this can never
      // apply to a mandatory-MFA role, regardless of what's stored here).
      if (result.data.mfa_bypassed) {
        window.sessionStorage.removeItem('staffMfaPending');
        navigate('/staff', { replace: true });
        return;
      }

      // The login response doesn't carry role/enrollment - ask the
      // authoritative status endpoint instead of guessing from the JWT.
      const statusResult = await getMfaStatus(
        'staff',
        result.data.access_token
      );
      const role = statusResult.data?.role ?? null;
      const mfaEnrolled = statusResult.data?.mfa_enrolled ?? false;

      // Mandatory roles always go through this (enrolled or not); anyone
      // else only goes through it if they've voluntarily enrolled via
      // Settings - once MFA is on for an account, it must be challenged
      // every login.
      if (isMfaRole(role) || mfaEnrolled) {
        window.sessionStorage.setItem('staffMfaPending', 'true');
        navigate(mfaEnrolled ? '/staff/mfa/verify' : '/staff/mfa/enroll', {
          replace: true,
        });
        return;
      }

      window.sessionStorage.removeItem('staffMfaPending');
      navigate('/staff', { replace: true });
    } catch {
      setError(
        'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setResetMessage(null);

    const parsed = forgotPasswordSchema.safeParse({ email: resetEmail });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email.');
      return;
    }

    setIsResetting(true);
    const result = await forgotPassword(parsed.data);
    setIsResetting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setResetMessage(
      result.data?.message ?? 'Password reset email sent. Check your inbox.'
    );
  };

  return (
    <form className={styles.form} onSubmit={(event) => void handleLogin(event)}>
      <label className={styles.field}>
        <span className={styles.label}>Username or email</span>
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 18,
            }}
          >
            <Mail size={20} />
          </span>
          <input
            className={styles.input}
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            style={{ paddingLeft: '48px' }}
          />
        </div>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 18,
            }}
          >
            <Lock size={20} />
          </span>
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ paddingLeft: '48px' }}
          />
        </div>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {resetMessage ? <p className={styles.success}>{resetMessage}</p> : null}
      <button className={styles.button} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in' : 'Sign in'}
      </button>
      <div className={styles.forgot}>
        <p className={styles.divider}>Need to reset your password?</p>
        <label className={styles.field}>
          <span className={styles.label}>Reset email</span>
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
          />
        </label>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={isResetting}
          onClick={() => void handleForgotPassword()}
        >
          {isResetting ? 'Sending reset' : 'Forgot password'}
        </button>
      </div>
    </form>
  );
}
