import { useState } from 'react';
import { setMfaPreference, unenrollMfa } from '../../../shared/api/mfa.api';
import { MfaMethodEnrollFlow } from '../../../shared/components/MfaMethodEnrollFlow/MfaMethodEnrollFlow';
import { Modal } from '../../../shared/components/Modal/Modal';
import { MANDATORY_MFA_ROLES } from '../../../shared/auth/mandatoryMfaRoles';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import type {
  MfaMethod,
  MfaStatusResponse,
} from '../../../shared/auth/mfa.types';
import styles from '../SettingsPage.module.css';
import { LoadingState } from '../../../shared/components/LoadingState/LoadingState';

const METHOD_LABEL: Record<MfaMethod, string> = {
  authenticator: 'Authenticator app',
  email: 'Email',
};

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
 * Admin/Supervisor/Superadmin's *first-ever* enroll UI still comes
 * exclusively from the guard's MfaSetupModal (see the comment below), not
 * from here; once at least one method is enrolled, this tab is the one place
 * to add a second method, switch the preferred one, or unbind either.
 */
export function SecurityTab({
  role,
  accessToken,
  status,
  onChanged,
}: SecurityTabProps) {
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [setupInitialMethod, setSetupInitialMethod] = useState<
    MfaMethod | undefined
  >(undefined);
  const [disablingMethod, setDisablingMethod] = useState<MfaMethod | null>(
    null
  );
  const [disableError, setDisableError] = useState<string | null>(null);
  const [isSavingPreference, setIsSavingPreference] = useState(false);

  const isMandatoryRole = Boolean(
    status?.role && MANDATORY_MFA_ROLES.has(status.role)
  );
  const methods = status?.methods ?? { authenticator: false, email: false };
  const enrolledCount = Number(methods.authenticator) + Number(methods.email);

  function openSetupModal(initialMethod?: MfaMethod) {
    setDisableError(null);
    setSetupInitialMethod(initialMethod);
    setIsSetupModalOpen(true);
  }

  function handleEnrolled() {
    setIsSetupModalOpen(false);
    onChanged();
  }

  const handleDisable = async (method: MfaMethod) => {
    setDisablingMethod(method);
    setDisableError(null);
    const result = await unenrollMfa(role, accessToken, method);
    setDisablingMethod(null);

    if (result.error) {
      setDisableError(result.error);
      return;
    }

    onChanged();
  };

  const handlePreferenceChange = async (method: MfaMethod) => {
    setIsSavingPreference(true);
    await setMfaPreference(role, accessToken, method);
    setIsSavingPreference(false);
    onChanged();
  };

  // Mirrors the guard's own gate exactly: a mandatory role with nothing
  // enrolled yet is always behind MfaSetupModal's full-screen popup, which
  // renders the same MfaMethodEnrollFlow this tab would - showing a second
  // one here would just race it for no reason.
  const showsOwnSetupUi = !(isMandatoryRole && enrolledCount === 0);

  return (
    <section className={styles.section} aria-labelledby="mfa-section-title">
      <h2 className={styles.sectionTitle} id="mfa-section-title">
        Multi-Factor Authentication
      </h2>
      {status === null ? (
        <LoadingState label="Loading your MFA status..." />
      ) : enrolledCount > 0 ? (
        <p className={styles.statusEnabled}>MFA is enabled on your account.</p>
      ) : isMandatoryRole ? (
        <p className={styles.statusRequired}>
          MFA is required for your role and is not yet set up. Complete setup in
          the popup - it will keep appearing until enrollment is finished.
        </p>
      ) : (
        <p className={styles.copy}>
          Add an extra layer of security with an authenticator app or email
          codes. This is optional for your role.
        </p>
      )}

      {status && showsOwnSetupUi ? (
        <>
          <ul className={styles.mfaMethodList}>
            {(['authenticator', 'email'] as const).map((method) => (
              <li key={method} className={styles.mfaMethodRow}>
                <span className={styles.mfaMethodName}>
                  {METHOD_LABEL[method]}
                </span>
                <span className={styles.copy}>
                  {methods[method] ? 'Enabled' : 'Not set up'}
                </span>
                {methods[method] ? (
                  // A mandatory role's authenticator factor is permanent,
                  // never removable (see mfaUnenrollController's matching
                  // server-side guard) - hide the button rather than showing
                  // one that would just 409.
                  isMandatoryRole && method === 'authenticator' ? null : (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={disablingMethod === method}
                      onClick={() => void handleDisable(method)}
                    >
                      {disablingMethod === method ? 'Removing...' : 'Remove'}
                    </button>
                  )
                ) : (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => openSetupModal(method)}
                  >
                    Set up
                  </button>
                )}
              </li>
            ))}
          </ul>

          {disableError ? (
            <p className={styles.statusRequired} role="alert">
              {disableError}
            </p>
          ) : null}

          {enrolledCount === 0 ? (
            <button
              className={styles.button}
              type="button"
              onClick={() => openSetupModal()}
            >
              Set up multi-factor authentication
            </button>
          ) : null}

          {enrolledCount === 2 && status ? (
            <label className={styles.copy}>
              Preferred method at login
              <select
                value={status.preferred_method}
                disabled={isSavingPreference}
                onChange={(event) =>
                  void handlePreferenceChange(event.target.value as MfaMethod)
                }
              >
                <option value="authenticator">
                  {METHOD_LABEL.authenticator}
                </option>
                <option value="email">{METHOD_LABEL.email}</option>
              </select>
            </label>
          ) : null}
        </>
      ) : null}

      <Modal
        isOpen={isSetupModalOpen}
        title="Set up multi-factor authentication"
        onClose={() => setIsSetupModalOpen(false)}
      >
        <MfaMethodEnrollFlow
          role={role}
          accessToken={accessToken}
          initialMethod={setupInitialMethod}
          onEnrolled={handleEnrolled}
        />
      </Modal>
    </section>
  );
}
