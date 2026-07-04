import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { forgotPassword, login } from '../../../api/staffAuth.api';
import {
  forgotPasswordSchema,
  staffLoginSchema,
} from '../../../modules/validators/staffAuth.validator';
import styles from './StaffLoginForm.module.css';

function isMfaRole(role?: string) {
  return role === 'Admin' || role === 'Supervisor';
}

export function StaffLoginForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [username, setUsername] = useState('');
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

    const parsed = staffLoginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your login details.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(parsed.data);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError('Invalid username or password.');
      return;
    }

    await applySession(result.data.access_token, result.data.refresh_token);

    if (result.data.requires_mfa || isMfaRole(result.data.role)) {
      window.sessionStorage.setItem('staffMfaPending', 'true');
      navigate(
        result.data.mfa_enrolled === false
          ? '/staff/mfa/enroll'
          : '/staff/mfa/verify',
        { replace: true }
      );
      return;
    }

    window.sessionStorage.removeItem('staffMfaPending');
    navigate('/staff', { replace: true });
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
        <span className={styles.label}>Username</span>
        <input
          className={styles.input}
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
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
