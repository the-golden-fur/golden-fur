import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../providers/AuthProvider/useAuth';
import { login } from '../../../api/customerAuth.api';
import { customerLoginSchema } from '../../../modules/validators/customerAuth.validator';
import { SocialAuthButtons } from '../../buttons/SocialAuthButtons/SocialAuthButtons';
import styles from './CustomerLoginForm.module.css';

export function CustomerLoginForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = customerLoginSchema.safeParse({
      account_email: accountEmail,
      password,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your login details.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(parsed.data);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError('Invalid email or password.');
      return;
    }

    await applySession(result.data.access_token, result.data.refresh_token);
    navigate('/portal', { replace: true });
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            className={styles.input}
            autoComplete="email"
            type="email"
            value={accountEmail}
            onChange={(event) => setAccountEmail(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
      </form>

      <SocialAuthButtons />
    </div>
  );
}
