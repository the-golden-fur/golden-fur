import { useState } from 'react';
import { unenrollMfa } from '../../../shared/api/mfa.api';
import { TotpEnrollPanel } from '../../../shared/components/TotpEnrollPanel/TotpEnrollPanel';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import type { MfaStatusResponse } from '../../../shared/auth/mfa.types';
import styles from '../SettingsPage.module.css';

const MANDATORY_MFA_ROLES = new Set(['Admin', 'Superadmin']);

interface SecurityTabProps {
  role: ThemeRole;
  accessToken: string;
  status: MfaStatusResponse | null;
  /** Bumps SettingsPage's refreshKey so the next getMfaStatus re-fetch picks
   * up the change - SettingsPage owns the fetch since Config-tab/Account-tab
   * gating also depends on `status.role`. */
  onChanged: () => void;
}

/**
 * Settings > Security. Body moved unchanged from the pre-tabs SettingsPage -
 * Admin/Superadmin's enroll UI still comes exclusively from the guard's
 * MfaSetupModal (see the comment below), not from here.
 */
export function SecurityTab({
  role,
  accessToken,
  status,
  onChanged,
}: SecurityTabProps) {
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const isMandatoryRole = Boolean(
    status?.role && MANDATORY_MFA_ROLES.has(status.role)
  );

  const handleDisable = async () => {
    setIsDisabling(true);
    setDisableError(null);
    const result = await unenrollMfa(role, accessToken);
    setIsDisabling(false);

    if (result.error) {
      setDisableError(result.error);
      return;
    }

    onChanged();
  };

  return (
    <section className={styles.section} aria-labelledby="mfa-section-title">
      <h2 className={styles.sectionTitle} id="mfa-section-title">
        Multi-Factor Authentication
      </h2>
      {status === null ? (
        <p className={styles.copy}>Loading your MFA status...</p>
      ) : status.mfa_enrolled ? (
        <p className={styles.statusEnabled}>MFA is enabled on your account.</p>
      ) : isMandatoryRole ? (
        <p className={styles.statusRequired}>
          MFA is required for your role and is not yet set up. Complete setup in
          the popup - it will keep appearing until enrollment is finished.
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
      {status && !status.mfa_enrolled && !isMandatoryRole ? (
        <TotpEnrollPanel
          role={role}
          accessToken={accessToken}
          onEnrolled={onChanged}
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
  );
}
