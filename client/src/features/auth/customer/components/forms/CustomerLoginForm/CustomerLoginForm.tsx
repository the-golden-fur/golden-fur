import { useState, type FormEvent } from 'react';
import { Chrome, Lock, Mail } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import { setSessionPersistence } from '../../../../../../shared/auth/api/auth.api';
import { getStoredDeviceToken } from '../../../../../../shared/auth/api/trustedDevice.api';
import { getMfaStatus } from '../../../../../../shared/api/mfa.api';
import { LoadingState } from '../../../../../../shared/components/LoadingState/LoadingState';
import { login, signInWithGoogle } from '../../../api/customerAuth.api';
import { customerLoginSchema } from '../../../modules/validators/customerAuth.validator';
import styles from './CustomerLoginForm.module.css';

export function CustomerLoginForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

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

    // Load-bearing, not defensive boilerplate: without it, a thrown
    // exception anywhere in this sequence (a network failure inside
    // applySession/getMfaStatus, say) would skip setIsSubmitting(false)
    // entirely, leaving "Sign in" silently stuck disabled forever with no
    // visible error - the reported "random freeze" on login. login() itself
    // no longer throws on a network failure either (see customerAuth.api.ts),
    // but this is the backstop for everything downstream of it.
    try {
      const deviceToken = getStoredDeviceToken('customer');
      const result = await login({
        ...parsed.data,
        ...(deviceToken ? { device_token: deviceToken } : {}),
      });

      if (result.error || !result.data) {
        setError('Invalid email or password.');
        return;
      }

      // Customer sessions survive closing the browser, unlike staff's.
      setSessionPersistence(true);
      await applySession(result.data.access_token, result.data.refresh_token);

      // Credentials are valid, so login still succeeds even when
      // deactivated - route to the notice page instead of the portal/MFA
      // flow, using the session just established so its REACTIVATE button
      // can call the self-service activate endpoint without a second login.
      if (result.data.account_status === 'deactivated') {
        navigate('/account-deactivated', { replace: true });
        return;
      }

      // A valid trusted-device token was honored server-side - skip the MFA
      // redirect entirely.
      if (result.data.mfa_bypassed) {
        window.sessionStorage.removeItem('customerMfaPending');
        navigate('/portal', { replace: true });
        return;
      }

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
    } catch {
      setError(
        'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // signInWithOAuth takes the browser away to the provider itself (a full
  // page redirect, not a fetch) - there is nothing for this SPA to navigate
  // to afterward, and OAuthCallbackPage only has real tokens to read once
  // the provider redirects back. A stray navigate('/auth/callback') here
  // used to race that handoff, landing on the callback page with no tokens
  // yet and surfacing "OAuth session could not be established" - removed;
  // the loading state below just covers the brief moment before the
  // redirect actually happens, instead of a second, premature route change.
  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSubmitting(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError('Could not continue with Google.');
      setIsGoogleSubmitting(false);
    }
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
            disabled={isGoogleSubmitting}
            aria-label="Continue with Google"
          >
            {isGoogleSubmitting ? (
              <LoadingState size="inline" label="Redirecting to Google..." />
            ) : (
              <>
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
              </>
            )}
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
