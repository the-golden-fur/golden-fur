import { useState, type FormEvent } from 'react';
import { Chrome, Facebook, Lock, Mail, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { setSessionPersistence } from '../../../../../../shared/auth/api/auth.api';
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
      // Customer sessions survive closing the browser, unlike staff's.
      setSessionPersistence(true);
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
          <span className={styles.label}>Full name</span>
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
              <UserRound size={20} />
            </span>
            <input
              className={styles.input}
              autoComplete="name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
        </label>

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
