import { useState, type FormEvent } from 'react';
import { Chrome, Facebook, Lock, Mail } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { setSessionPersistence } from '../../../../../../shared/auth/api/auth.api';
import { getMfaStatus } from '../../../../../../shared/api/mfa.api';
import {
  login,
  signInWithGoogle,
  signInWithFacebook,
} from '../../../api/customerAuth.api';
import { customerLoginSchema } from '../../../modules/validators/customerAuth.validator';
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

    // Customer sessions survive closing the browser, unlike staff's.
    setSessionPersistence(true);
    await applySession(result.data.access_token, result.data.refresh_token);

    // The login response doesn't carry enrollment status - ask the
    // authoritative status endpoint, same as staff, so a customer who has
    // already turned MFA on in Settings gets challenged every login.
    const statusResult = await getMfaStatus(
      'customer',
      result.data.access_token
    );

    if (statusResult.data?.mfa_enrolled) {
      window.sessionStorage.setItem('customerMfaPending', 'true');
      navigate('/portal/mfa/verify', { replace: true });
      return;
    }

    window.sessionStorage.removeItem('customerMfaPending');
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
      <div className={styles.divider}>or continue with email</div>

      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className={styles.social}>
          <button
            type="button"
            className={styles.socialButton}
            onClick={() => void handleGoogleSignIn()}
            aria-label="Continue with Google"
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 9999,
                background: '#ffffff',
                boxShadow: '0 4px 10px rgba(21, 24, 28, 0.06)',
                marginRight: 10,
                flexShrink: 0,
              }}
            >
              <Chrome size={18} color="#4285F4" />
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              Continue with Google
            </span>
          </button>

          <button
            type="button"
            className={styles.socialButton}
            onClick={() => void handleFacebookSignIn()}
            aria-label="Continue with Facebook"
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 9999,
                background: '#1877F2',
                boxShadow: '0 4px 10px rgba(21, 24, 28, 0.06)',
                marginRight: 10,
                flexShrink: 0,
              }}
            >
              <Facebook size={18} color="#ffffff" />
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              Continue with Facebook
            </span>
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <div className={styles.iconField}>
            <span
              className={styles.glyph}
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 18,
              }}
            >
              <Mail size={20} />
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
            <span
              className={styles.glyph}
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 18,
              }}
            >
              <Lock size={20} />
            </span>
            <input
              className={styles.input}
              autoComplete="current-password"
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
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
