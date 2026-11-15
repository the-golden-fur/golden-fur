import { useState } from 'react';
import { setMfaPreference, unenrollMfa } from '../../../shared/api/mfa.api';
import { MfaMethodEnrollFlow } from '../../../shared/components/MfaMethodEnrollFlow/MfaMethodEnrollFlow';
import { Modal } from '../../../shared/components/Modal/Modal';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog/ConfirmDialog';
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
 * Settings > Security. MFA is optional for every role - this tab is where
 * anyone sets it up, adds a second method, switches the preferred one,
 * unbinds a method, or turns MFA off entirely. Default-on roles also get a
 * dismissible reminder at login (StaffAuthGuard's MfaSetupModal).
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
  const [isTurnOffConfirmOpen, setIsTurnOffConfirmOpen] = useState(false);
  const [isTurningOff, setIsTurningOff] = useState(false);
  const [isSavingPreference, setIsSavingPreference] = useState(false);

  const isMandatoryRole = Boolean(
    status?.role && MANDATORY_MFA_ROLES.has(status.role)
  );
  const methods = status?.methods ?? { authenticator: false, email: false };
  const enrolledCount = Number(methods.authenticator) + Number(methods.email);
  // Admin-tier roles manage 'email' from Settings > Account instead (see
  // mfa_email_verifications' migration comment) - this tab only ever shows
  // the authenticator row for them, so the preference dropdown below also
  // only makes sense when both rows shown here are actually enrolled.
  const visibleMethods = isMandatoryRole
    ? (['authenticator'] as const)
    : (['authenticator', 'email'] as const);
  const visibleEnrolledCount = visibleMethods.filter(
    (method) => methods[method]
  ).length;

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

  // Email first, then the authenticator: Supabase only lets a verified
  // factor be removed from an aal2 session, and removing the last one is
  // what drops it. For default-on roles the server also removes email
  // whenever the authenticator goes (see mfaUnenrollController).
  const handleTurnOff = async () => {
    setIsTurningOff(true);
    setDisableError(null);

    for (const method of ['email', 'authenticator'] as const) {
      if (!methods[method]) continue;

      const result = await unenrollMfa(role, accessToken, method);
      if (result.error) {
        setIsTurningOff(false);
        setIsTurnOffConfirmOpen(false);
        setDisableError(result.error);
        onChanged();
        return;
      }
    }

    setIsTurningOff(false);
    setIsTurnOffConfirmOpen(false);
    onChanged();
  };

  const handlePreferenceChange = async (method: MfaMethod) => {
    setIsSavingPreference(true);
    await setMfaPreference(role, accessToken, method);
    setIsSavingPreference(false);
    onChanged();
  };

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
        <p className={styles.copy}>
          MFA is optional, but recommended for your role. Set up an
          authenticator app (like Google Authenticator) to protect your account.
        </p>
      ) : (
        <p className={styles.copy}>
          Add an extra layer of security with an authenticator app or email
          codes. This is optional for your role.
        </p>
      )}

      {status ? (
        <>
          <ul className={styles.mfaMethodList}>
            {visibleMethods.map((method) => (
              <li key={method} className={styles.mfaMethodRow}>
                <span className={styles.mfaMethodName}>
                  {METHOD_LABEL[method]}
                </span>
                <span className={styles.copy}>
                  {methods[method] ? 'Enabled' : 'Not set up'}
                </span>
                {methods[method] ? (
                  // A default-on role's authenticator can't be removed on
                  // its own (that would leave email-only - see
                  // mfaUnenrollController); "Turn off MFA" below covers it.
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
              onClick={() =>
                openSetupModal(isMandatoryRole ? 'authenticator' : undefined)
              }
            >
              Set up multi-factor authentication
            </button>
          ) : (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                setDisableError(null);
                setIsTurnOffConfirmOpen(true);
              }}
            >
              Turn off MFA
            </button>
          )}

          {visibleEnrolledCount === 2 && status ? (
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

      <ConfirmDialog
        isOpen={isTurnOffConfirmOpen}
        title="Turn off multi-factor authentication?"
        body={
          <p>
            Every MFA method on your account will be removed, and you'll sign in
            with just your password. Any remembered devices will also be
            forgotten. You can turn MFA back on any time.
          </p>
        }
        confirmLabel="Turn off MFA"
        tone="danger"
        isConfirming={isTurningOff}
        onConfirm={() => void handleTurnOff()}
        onCancel={() => setIsTurnOffConfirmOpen(false)}
      />

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
