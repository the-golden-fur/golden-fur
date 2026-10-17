import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Mail } from 'lucide-react';
import { requestPasswordReset } from '../../api/customerAuth.api';
import { customerForgotPasswordSchema } from '../../modules/validators/customerAuth.validator';
import styles from './ForgotPasswordPage.module.css';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = customerForgotPasswordSchema.safeParse({
      account_email: email,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? 'Enter a valid email address.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // The server always returns 200 regardless of whether the email exists
      // (user-enumeration prevention), so we don't inspect the response body.
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch {
      setError(
        'Could not reach the server. Check your connection and try again.'
      );
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
          <Mail size={24} />
        </div>

        <h1 className={styles.heading}>Forgot your password?</h1>
        <p className={styles.sub}>
          Enter your email address and we&apos;ll send you a link to reset your
          password.
        </p>

        {submitted ? (
          <p className={styles.success} role="status">
            Check your inbox — if an account exists for that email address,
            you&apos;ll receive a reset link shortly.
          </p>
        ) : (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.label}>Email address</span>
              <div className={styles.iconField}>
                <span className={styles.glyph} aria-hidden="true">
                  <Mail size={20} />
                </span>
                <input
                  id="forgot-password-email"
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
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
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <Link className={styles.backLink} to="/login">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
