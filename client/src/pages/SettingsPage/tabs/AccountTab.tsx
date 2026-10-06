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
import {
  enrollMfa,
  unenrollMfa,
  startMfaEmailVerification,
  confirmMfaEmailVerification,
  unbindMfaEmail,
} from '../../../shared/api/mfa.api';
import { OtpInput } from '../../../shared/components/OtpInput/OtpInput';
import { MANDATORY_MFA_ROLES } from '../../../shared/auth/mandatoryMfaRoles';
import { passwordChangeSchema } from '../../../shared/auth/password.validator';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import type { MfaStatusResponse } from '../../../shared/auth/mfa.types';
import { useUnsavedChanges } from '../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
import styles from '../SettingsPage.module.css';
import { LoadingState } from '../../../shared/components/LoadingState/LoadingState';

interface AccountTabProps {
  role: ThemeRole;
  userId: string;
  accessToken: string;
  status: MfaStatusResponse | null;
  /** Bumps SettingsPage's refreshKey so the next getMfaStatus re-fetch picks
   * up a bind/change/unbind - mirrors SecurityTab's identical prop. */
  onChanged: () => void;
}

/**
 * Settings > Account: username (staff only - customers log in by email, no
 * username column on customer_profiles), password self-change (both roles),
 * and - Admin-tier staff only - the verified-email binding used by "email"
 * MFA (moved here from Settings > Security; see mfa_email_verifications'
 * migration comment for why only mandatory-MFA roles need it). Distinct from
 * Profile, which holds self-managed contact details.
 */
export function AccountTab({
  role,
  userId,
  accessToken,
  status,
  onChanged,
}: AccountTabProps) {
  const isMandatoryRole = Boolean(
    role === 'staff' && status?.role && MANDATORY_MFA_ROLES.has(status.role)
  );

  return (
    <>
      {role === 'staff' ? (
        <UsernameForm userId={userId} accessToken={accessToken} />
      ) : null}
      <PasswordForm role={role} />
      {role === 'customer' ? <GoogleAccountForm /> : null}
      {isMandatoryRole ? (
        <MfaEmailVerificationForm
          accessToken={accessToken}
          verification={status?.email_verification ?? null}
          emailMfaEnabled={status?.methods.email ?? false}
          onChanged={onChanged}
        />
      ) : null}
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
        <LoadingState />
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

interface MfaEmailVerificationFormProps {
  accessToken: string;
  verification: { email: string; verified: boolean } | null;
  /** status.methods.email - whether 'email' is currently an active MFA
   * factor, separate from `verification.verified` (proving ownership) since
   * a verified email doesn't turn itself on as a login method. */
  emailMfaEnabled: boolean;
  onChanged: () => void;
}

/**
 * Admin-tier "bind/unbind/change email" for MFA - replaces the "Email" row
 * that used to sit in Settings > Security for this role (see
 * mfa_email_verifications' migration comment on why only mandatory-MFA
 * roles need ownership proof before "email" can become an active MFA
 * method). `verification` is null until the automatic first-login send has
 * gone out (staffAuth.controller.ts's mfaVerifyController), which should be
 * immediate in practice, but a manual "Send code" is offered as a fallback
 * in case it hasn't landed yet.
 */
function MfaEmailVerificationForm({
  accessToken,
  verification,
  emailMfaEnabled,
  onChanged,
}: MfaEmailVerificationFormProps) {
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUnbinding, setIsUnbinding] = useState(false);
  const [isTogglingMethod, setIsTogglingMethod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEnableEmailMfa = async () => {
    setError(null);
    setSuccess(null);
    setIsTogglingMethod(true);

    const result = await enrollMfa('staff', accessToken, 'email');

    setIsTogglingMethod(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess('Email is now set up as a login method.');
    onChanged();
  };

  const handleDisableEmailMfa = async () => {
    setError(null);
    setSuccess(null);
    setIsTogglingMethod(true);

    const result = await unenrollMfa('staff', accessToken, 'email');

    setIsTogglingMethod(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess('Email is no longer a login method.');
    onChanged();
  };

  const handleSend = async (email?: string) => {
    setError(null);
    setSuccess(null);
    setIsSending(true);

    const result = await startMfaEmailVerification(accessToken, email);

    setIsSending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setCode('');
    setIsChangingEmail(false);
    setNewEmail('');
    setSuccess(`A verification code was sent to ${result.data?.email}.`);
    onChanged();
  };

  const handleConfirm = async () => {
    setError(null);
    setSuccess(null);
    setIsConfirming(true);

    const result = await confirmMfaEmailVerification(accessToken, code);

    setIsConfirming(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setCode('');
    setSuccess('Email verified.');
    onChanged();
  };

  const handleUnbind = async () => {
    setError(null);
    setSuccess(null);
    setIsUnbinding(true);

    const result = await unbindMfaEmail(accessToken);

    setIsUnbinding(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess(
      'Email unbound - email is no longer available as a login method.'
    );
    onChanged();
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Email for two-factor login</h2>
      <p className={styles.copy}>
        Your role requires proving you own an email before it can be used as a
        second login-verification method, alongside your authenticator app.
      </p>
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className={styles.successBanner}>{success}</p> : null}

      {verification === null ? (
        <button
          className={styles.button}
          type="button"
          disabled={isSending}
          onClick={() => void handleSend()}
        >
          {isSending ? 'Sending...' : 'Send verification code'}
        </button>
      ) : verification.verified ? (
        <>
          <p className={styles.copy}>
            <strong>{verification.email}</strong> - verified.
          </p>
          {emailMfaEnabled ? (
            <p className={styles.copy}>
              Email is set up as a login method.{' '}
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={isTogglingMethod}
                onClick={() => void handleDisableEmailMfa()}
              >
                {isTogglingMethod ? 'Turning off...' : 'Turn off'}
              </button>
            </p>
          ) : (
            <button
              className={styles.button}
              type="button"
              disabled={isTogglingMethod}
              onClick={() => void handleEnableEmailMfa()}
            >
              {isTogglingMethod
                ? 'Turning on...'
                : 'Use this email for two-factor login'}
            </button>
          )}
          {isChangingEmail ? (
            <div className={styles.form}>
              <label className={styles.field}>
                <span className={styles.label}>New email</span>
                <input
                  className={styles.input}
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
              </label>
              <button
                className={styles.button}
                type="button"
                disabled={isSending || !newEmail}
                onClick={() => void handleSend(newEmail)}
              >
                {isSending ? 'Sending...' : 'Send code to this email'}
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  setIsChangingEmail(false);
                  setNewEmail('');
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.form}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setIsChangingEmail(true)}
              >
                Change email
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={isUnbinding}
                onClick={() => void handleUnbind()}
              >
                {isUnbinding ? 'Unbinding...' : 'Unbind'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.form}>
          <p className={styles.copy}>
            We emailed a 6-digit code to <strong>{verification.email}</strong>.
            Enter it below to confirm you own this address.
          </p>
          <div className={styles.field}>
            <span className={styles.label}>6-digit code</span>
            <OtpInput value={code} onChange={setCode} label="6-digit code" />
          </div>
          <button
            className={styles.button}
            type="button"
            disabled={isConfirming || code.length !== 6}
            onClick={() => void handleConfirm()}
          >
            {isConfirming ? 'Confirming...' : 'Confirm code'}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={isSending}
            onClick={() => void handleSend()}
          >
            {isSending ? 'Sending...' : 'Resend code'}
          </button>
        </div>
      )}
    </section>
  );
}
