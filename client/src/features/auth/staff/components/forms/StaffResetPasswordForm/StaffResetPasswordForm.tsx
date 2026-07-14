import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  establishRecoverySession,
  updateStaffPassword,
} from '../../../api/staffAuth.api';
import { resetPasswordSchema } from '../../../modules/validators/staffAuth.validator';
import styles from './StaffResetPasswordForm.module.css';

const REDIRECT_DELAY_MS = 2000;

/**
 * M01 Process 3 (password reset), the "Staff enters and confirms new
 * password" step onward. The request-email half (StaffLoginForm's "Forgot
 * password") already existed; this is the page the emailed reset link
 * actually lands on to complete the flow.
 */
export function StaffResetPasswordForm() {
  const navigate = useNavigate();
  const hasRun = useRef(false);

  const [linkStatus, setLinkStatus] = useState<'checking' | 'ok' | 'invalid'>(
    'checking'
  );
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    void establishRecoverySession().then((result) => {
      if (result.error) {
        setLinkStatus('invalid');
        setLinkError(result.error);
        return;
      }

      setLinkStatus('ok');
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = resetPasswordSchema.safeParse({
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your new password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const result = await updateStaffPassword(parsed.data.password);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setIsComplete(true);
    setTimeout(() => {
      navigate('/staff/login', { replace: true });
    }, REDIRECT_DELAY_MS);
  };

  if (linkStatus === 'checking') {
    return <p role="status">Verifying reset link...</p>;
  }

  if (linkStatus === 'invalid') {
    return (
      <div className={styles.wrapper}>
        <p className={styles.error} role="alert">
          {linkError}
        </p>
        <a className={styles.link} href="/staff/login">
          Back to login
        </a>
      </div>
    );
  }

  if (isComplete) {
    return (
      <p className={styles.success}>
        Password updated. Redirecting to login...
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
      <label className={styles.field}>
        <span className={styles.label}>New password</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Confirm new password</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Updating...' : 'Set new password'}
      </button>
    </form>
  );
}
