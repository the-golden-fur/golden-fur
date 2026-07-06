import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  signup,
  signInWithGoogle,
  signInWithFacebook,
} from '../../../api/customerAuth.api';
import { customerSignupSchema } from '../../../modules/validators/customerAuth.validator';
import styles from './CustomerSignupForm.module.css';

export function CustomerSignupForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [fullName, setFullName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = customerSignupSchema.safeParse({
      full_name: fullName,
      account_email: accountEmail,
      password,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details.');
      return;
    }

    setIsSubmitting(true);
    const result = await signup(parsed.data);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError('Unable to create account.');
      return;
    }

    const { access_token, refresh_token } = result.data;
    if (access_token && refresh_token) {
      await applySession(access_token, refresh_token);
    }
    navigate('/portal', { replace: true });
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const result = await signInWithGoogle();
    if (result.error) {
      setError('Could not continue with Google.');
      return;
    }
    navigate('/auth/callback', { replace: true });
  };

  const handleFacebookSignIn = async () => {
    setError(null);
    const result = await signInWithFacebook();
    if (result.error) {
      setError('Could not continue with Facebook.');
      return;
    }
    navigate('/auth/callback', { replace: true });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.social}>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => void handleGoogleSignIn()}
        >
          <span className={styles.g}>G</span> Continue with Google
        </button>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => void handleFacebookSignIn()}
        >
          <span className={styles.f}>f</span> Continue with Facebook
        </button>
      </div>

      <div className={styles.divider}>or continue with email</div>

      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className={styles.field}>
          <span className={styles.label}>Full name</span>
          <input
            className={styles.input}
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <div className={styles.iconField}>
            <span className={styles.glyph} aria-hidden="true">
              ✉
            </span>
            <input
              className={styles.input}
              autoComplete="email"
              type="email"
              value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)}
            />
          </div>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <div className={styles.iconField}>
            <span className={styles.glyph} aria-hidden="true">
              🔒
            </span>
            <input
              className={styles.input}
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
