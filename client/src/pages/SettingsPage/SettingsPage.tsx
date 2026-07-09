import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus, unenrollMfa } from '../../shared/api/mfa.api';
import { TotpEnrollPanel } from '../../shared/components/TotpEnrollPanel/TotpEnrollPanel';
import type { ThemeRole } from '../../shared/providers/ThemeProvider/themeContext';
import type { MfaStatusResponse } from '../../shared/auth/mfa.types';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  role: ThemeRole;
}

const MANDATORY_MFA_ROLES = new Set(['Admin', 'Superadmin']);

const LOGIN_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/login',
  customer: '/login',
};

export function SettingsPage({ role }: SettingsPageProps) {
  const { accessToken, signOut } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void getMfaStatus(role, accessToken).then((result) => {
      if (isMounted && result.data) {
        setStatus(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [role, accessToken, refreshKey]);

  const isMandatoryRole = Boolean(
    status?.role && MANDATORY_MFA_ROLES.has(status.role)
  );

  const handleDisable = async () => {
    if (!accessToken) {
      return;
    }

    setIsDisabling(true);
    setDisableError(null);
    const result = await unenrollMfa(role, accessToken);
    setIsDisabling(false);

    if (result.error) {
      setDisableError(result.error);
      return;
    }

    setRefreshKey((key) => key + 1);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    window.sessionStorage.removeItem('staffMfaPending');
    window.sessionStorage.removeItem('customerMfaPending');
    navigate(LOGIN_PATH_BY_ROLE[role], { replace: true });
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <section
        className={styles.section}
        aria-labelledby="account-section-title"
      >
        <h2 className={styles.sectionTitle} id="account-section-title">
          Account
        </h2>
        <button
          className={styles.button}
          type="button"
          disabled={isSigningOut}
          onClick={() => void handleSignOut()}
        >
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </section>
      <section className={styles.section} aria-labelledby="mfa-section-title">
        <h2 className={styles.sectionTitle} id="mfa-section-title">
          Multi-Factor Authentication
        </h2>
        {status === null ? (
          <p className={styles.copy}>Loading your MFA status...</p>
        ) : status.mfa_enrolled ? (
          <p className={styles.statusEnabled}>
            MFA is enabled on your account.
          </p>
        ) : isMandatoryRole ? (
          <p className={styles.statusRequired}>
            MFA is required for your role and is not yet set up. Complete setup
            in the popup - it will keep appearing until enrollment is finished.
          </p>
        ) : (
          <p className={styles.copy}>
            Add an extra layer of security with an authenticator app. This is
            optional for your role.
          </p>
        )}
        {/*
          Admin/Superadmin get their enroll UI exclusively from the guard's
          MfaSetupModal. Rendering a second TotpEnrollPanel here at the same
          time would race it - both instances enroll independently, and each
          invalidates whichever QR/key the user just scanned from the other.
        */}
        {status && !status.mfa_enrolled && !isMandatoryRole && accessToken ? (
          <TotpEnrollPanel
            role={role}
            accessToken={accessToken}
            onEnrolled={() => setRefreshKey((key) => key + 1)}
          />
        ) : null}
        {status?.mfa_enrolled && !isMandatoryRole ? (
          <div>
            <button
              className={styles.button}
              type="button"
              disabled={isDisabling}
              onClick={() => void handleDisable()}
            >
              {isDisabling ? 'Disabling...' : 'Disable MFA'}
            </button>
            {disableError ? (
              <p className={styles.statusRequired}>{disableError}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
