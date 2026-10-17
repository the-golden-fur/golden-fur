import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Lock } from 'lucide-react';
import { z } from 'zod';
import { getSupabaseClient } from '../../../../../shared/auth/api/auth.api';
import styles from './ResetPasswordPage.module.css';

/**
 * Supabase sends the password-reset magic link to the /reset-password route
 * (the redirectTo we pass in the forgot-password controller). The token is
 * embedded in the URL hash (#access_token=...&type=recovery...) and must be
 * used to establish a session before calling updateUser({ password }).
 *
 * Flow:
 *  1. Page mounts → read & consume the hash fragment.
 *  2. If no valid recovery token is found → show "link invalid" notice.
 *  3. Otherwise → set the session from the hash → show the new-password form.
 *  4. On submit → updateUser({ password }) → navigate to /login.
 */

const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be 72 characters or fewer'),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type SessionState = 'loading' | 'ready' | 'invalid';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function consumeRecoveryToken() {
      const client = getSupabaseClient();
      if (!client) {
        setSessionState('invalid');
        return;
      }

      // Read the URL hash fragment that Supabase appended to our redirectTo URL.
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);

      // Clear the fragment from the URL so tokens don't linger in history.
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );

      const type = params.get('type');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (type !== 'recovery' || !accessToken || !refreshToken) {
        setSessionState('invalid');
        return;
      }

      const { error: sessionError } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setSessionState('invalid');
        return;
      }

      setSessionState('ready');
    }

    void consumeRecoveryToken();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = newPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your input.');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError('Could not reach the server. Try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await client.auth.updateUser({
        password: parsed.data.password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await client.auth.signOut();
      setDone(true);
      setTimeout(() => void navigate('/login', { replace: true }), 3000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link className={styles.logo} to="/">
          Golden Fur
        </Link>

        <div className={styles.iconWrap} aria-hidden="true">
          <Lock size={24} />
        </div>

        <h1 className={styles.heading}>Set a new password</h1>

        {sessionState === 'loading' && (
          <p className={styles.sub}>Verifying your reset link…</p>
        )}

        {sessionState === 'invalid' && (
          <div className={styles.invalid} role="alert">
            This password-reset link is invalid or has expired.
            <br />
            <Link to="/forgot-password">Request a new one →</Link>
          </div>
        )}

        {sessionState === 'ready' && !done && (
          <>
            <p className={styles.sub}>
              Choose a new password for your account.
            </p>
            <form
              className={styles.form}
              onSubmit={(event) => void handleSubmit(event)}
            >
              <label className={styles.field}>
                <span className={styles.label}>New password</span>
                <div className={styles.iconField}>
                  <span className={styles.glyph} aria-hidden="true">
                    <Lock size={20} />
                  </span>
                  <input
                    id="reset-password-new"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <span className={styles.hint}>At least 8 characters</span>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Confirm new password</span>
                <div className={styles.iconField}>
                  <span className={styles.glyph} aria-hidden="true">
                    <Lock size={20} />
                  </span>
                  <input
                    id="reset-password-confirm"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </div>
              </label>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}

              <button
                className={styles.submit}
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          </>
        )}

        {done && (
          <p className={styles.success} role="status">
            Password updated! Redirecting you to sign in…
          </p>
        )}

        <Link className={styles.backLink} to="/login">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
