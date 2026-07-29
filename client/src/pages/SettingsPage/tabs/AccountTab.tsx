import { useEffect, useState, type FormEvent } from 'react';
import {
  getStaffProfile,
  updateStaffUsername,
} from '../../../features/staff/api/staff.api';
import { updateStaffPassword } from '../../../features/auth/staff/api/staffAuth.api';
import { updateCustomerPassword } from '../../../features/auth/customer/api/customerAuth.api';
import { passwordChangeSchema } from '../../../shared/auth/password.validator';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import styles from '../SettingsPage.module.css';

interface AccountTabProps {
  role: ThemeRole;
  userId: string;
  accessToken: string;
}

/**
 * Settings > Account: username (staff only - customers log in by email, no
 * username column on customer_profiles) and password self-change (both
 * roles). Distinct from Profile, which holds self-managed contact details.
 */
export function AccountTab({ role, userId, accessToken }: AccountTabProps) {
  return (
    <>
      {role === 'staff' ? (
        <UsernameForm userId={userId} accessToken={accessToken} />
      ) : null}
      <PasswordForm role={role} />
    </>
  );
}

function UsernameForm({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}) {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getStaffProfile(userId, accessToken).then((result) => {
      if (isMounted && result.data) {
        setUsername(result.data.username);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [userId, accessToken]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setError(null);
    setSuccess(false);
    setIsSaving(true);

    const result = await updateStaffUsername(
      userId,
      accessToken,
      username.trim()
    );

    setIsSaving(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not update your username.');
      return;
    }

    setUsername(result.data.username);
    setSuccess(true);
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Username</h2>
      <p className={styles.copy}>
        Used to log in - shown alongside your role in the navbar.
      </p>
      {isLoading ? (
        <p className={styles.copy}>Loading...</p>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Username</span>
            <input
              className={styles.input}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          {error ? (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className={styles.successBanner}>Username updated.</p>
          ) : null}
          <button className={styles.button} type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save username'}
          </button>
        </form>
      )}
    </section>
  );
}

function PasswordForm({ role }: { role: ThemeRole }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = passwordChangeSchema.safeParse({
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your new password.');
      return;
    }

    setError(null);
    setSuccess(false);
    setIsSaving(true);

    const result =
      role === 'staff'
        ? await updateStaffPassword(parsed.data.password)
        : await updateCustomerPassword(parsed.data.password);

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setSuccess(true);
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Password</h2>
      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
      >
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
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className={styles.successBanner}>Password updated.</p>
        ) : null}
        <button className={styles.button} type="submit" disabled={isSaving}>
          {isSaving ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </section>
  );
}
