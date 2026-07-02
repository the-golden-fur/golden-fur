import { useState, type FormEvent } from 'react';
import { signup } from '../../../api/customerAuth.api';
import { customerSignupSchema } from '../../../modules/validators/customerAuth.validator';
import { SocialAuthButtons } from '../../buttons/SocialAuthButtons/SocialAuthButtons';
import styles from './CustomerSignupForm.module.css';

export function CustomerSignupForm() {
  const [fullName, setFullName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

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
      setError(result.error ?? 'Unable to create account.');
      return;
    }

    setIsCreated(true);
  };

  if (isCreated) {
    return (
      <p className={styles.success}>
        Account created. Check your email to confirm your address, then sign
        in.
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
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
            autoComplete="new-password"
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
          {isSubmitting ? 'Creating account' : 'Create account'}
        </button>
      </form>

      <SocialAuthButtons />
    </div>
  );
}
