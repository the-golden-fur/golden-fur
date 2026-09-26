import { useCallback, useEffect, useState } from 'react';
import {
  getStaffProfile,
  updateStaffUsername,
} from '../../../features/staff/api/staff.api';
import { updateStaffPassword } from '../../../features/auth/staff/api/staffAuth.api';
import {
  getLinkedProviders,
  unlinkGoogleIdentity,
  updateCustomerPassword,
} from '../../../features/auth/customer/api/customerAuth.api';
import { passwordChangeSchema } from '../../../shared/auth/password.validator';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import { useUnsavedChanges } from '../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
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
      {role === 'customer' ? <GoogleAccountForm /> : null}
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
  const [loadedUsername, setLoadedUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getStaffProfile(userId, accessToken).then((result) => {
      if (isMounted && result.data) {
        setUsername(result.data.username);
        setLoadedUsername(result.data.username);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [userId, accessToken]);

  const performSave = useCallback(async () => {
    if (username.trim().length < 3) {
      const message = 'Username must be at least 3 characters';
      setError(message);
      throw new Error(message);
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
      const message = result.error ?? 'Could not update your username.';
      setError(message);
      throw new Error(message);
    }

    setUsername(result.data.username);
    setLoadedUsername(result.data.username);
    setSuccess(true);
  }, [userId, accessToken, username]);

  const handleDiscard = useCallback(() => {
    setError(null);
    setUsername(loadedUsername);
  }, [loadedUsername]);

  useUnsavedChanges({
    id: 'account-username',
    label: 'Username',
    isDirty: !isLoading && username !== loadedUsername,
    onSave: performSave,
    onDiscard: handleDiscard,
  });

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
          onSubmit={(event) => {
            event.preventDefault();
            void performSave().catch(() => {
              // error is already set and shown below - nothing else to do.
            });
          }}
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

  const performSave = useCallback(async () => {
    const parsed = passwordChangeSchema.safeParse({
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? 'Check your new password.';
      setError(message);
      throw new Error(message);
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
      throw new Error(result.error);
    }

    setPassword('');
    setConfirmPassword('');
    setSuccess(true);
  }, [password, confirmPassword, role]);

  const handleDiscard = useCallback(() => {
    setError(null);
    setPassword('');
    setConfirmPassword('');
  }, []);

  // Dirty the moment either field has anything typed - there's no "loaded"
  // password to diff against, unlike every other draft in Settings.
  useUnsavedChanges({
    id: 'account-password',
    label: 'Password',
    isDirty: password.length > 0 || confirmPassword.length > 0,
    onSave: performSave,
    onDiscard: handleDiscard,
  });

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Password</h2>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void performSave().catch(() => {
            // error is already set and shown below - nothing else to do.
          });
        }}
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

/**
 * Settings > Account > "Google account": only rendered once we know the
 * customer actually has a Google identity linked (getLinkedProviders), per
 * the requirement that this option only appears for Google-linked accounts.
 * Renders nothing while loading or once confirmed absent - there is no
 * empty-state copy for "no Google account linked" here, unlike Password
 * above which always applies.
 */
function GoogleAccountForm() {
  const [providers, setProviders] = useState<string[] | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getLinkedProviders().then((result) => {
      if (isMounted) {
        setProviders(result.data?.providers ?? []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const hasGoogle = providers?.includes('google') ?? false;

  if (!hasGoogle || success) {
    return null;
  }

  // Supabase itself refuses to unlink a user's last remaining identity;
  // this check just turns that into a clear message up front instead of a
  // raw API error after the click. Note: setting a password via the
  // PasswordForm above does NOT add an identity here - updateUser({
  // password }) doesn't create an `email` row in auth.identities
  // (open Supabase issue, supabase/auth#2085), so it can never clear this
  // check. Only linking a second real OAuth provider (e.g. Facebook) does.
  const isOnlyIdentity = providers?.length === 1;

  const handleUnlink = async () => {
    setIsUnlinking(true);
    setError(null);

    const result = await unlinkGoogleIdentity();

    setIsUnlinking(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess(true);
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Google account</h2>
      {isOnlyIdentity ? (
        <p className={styles.copy}>
          Google is your only way to sign in to this account. Setting a password
          does not add a fallback here - link a Facebook account with the same
          email address first, so you don't lose access when you unlink Google.
        </p>
      ) : (
        <>
          <p className={styles.copy}>
            Your account is linked to Google. Unlinking stops "Continue with
            Google" from signing in to this account.
          </p>
          {error ? (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          ) : null}
          <button
            className={styles.button}
            type="button"
            disabled={isUnlinking}
            onClick={() => void handleUnlink()}
          >
            {isUnlinking ? 'Unlinking...' : 'Unlink Google'}
          </button>
        </>
      )}
    </section>
  );
}
