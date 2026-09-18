import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog/ConfirmDialog';
import {
  deactivateCustomer,
  deleteOwnAccount,
} from '../../../features/customers/api/customer.api';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import styles from '../SettingsPage.module.css';

/** Every localStorage key SettingsPage.tsx itself writes for the sidebar's
 * layout/sort/order/width state, keyed per role. Kept in one place here
 * rather than exported from SettingsPage.tsx, since that file owns writing
 * them and this is the only other place that needs to know the full set. */
function settingsLayoutStorageKeys(role: ThemeRole): string[] {
  return [
    `settings-sidebar-sort-${role}`,
    `settings-sidebar-order-${role}`,
    `settings-sidebar-recent-${role}`,
    `settings-sidebar-width-${role}`,
    `settings-sidebar-config-expanded-${role}`,
    `settings-config-sort-${role}`,
    `settings-config-order-${role}`,
    `settings-config-recent-${role}`,
  ];
}

type DangerAction = 'reset' | 'deactivate' | 'delete' | null;

/**
 * Settings > Danger (customer accounts only). Three self-service actions:
 * reset the Settings sidebar's own layout preferences, deactivate (logs
 * out immediately, reversible by logging back in before the admin-
 * configured auto-delete threshold), and delete (ends in either a real
 * hard delete or an anonymize-in-place fallback server-side, depending on
 * whether the customer has booking/transaction/credit history - see
 * deleteOrAnonymizeCustomer). Delete additionally gates its confirm button
 * behind typing the account's own email address exactly (case/whitespace-
 * insensitive) - the highest-consequence action here, so a plain Yes/No
 * click isn't enough.
 *
 * Only resets the client-side sidebar layout prefs above, not the
 * server-persisted theme/font/weight-unit/notification preferences
 * (Settings > Preferences) - those components don't currently expose a
 * reset hook, and adding one means changing four unrelated shared
 * components; left as a follow-up rather than folded in here.
 */
export function DangerTab() {
  const { user, accessToken, signOut } = useAuth();
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<DangerAction>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState('');

  const accountEmail = user?.email ?? '';
  const isDeleteConfirmationValid =
    accountEmail.length > 0 &&
    deleteEmailInput.trim().toLowerCase() === accountEmail.trim().toLowerCase();

  const closeDialog = () => {
    if (isWorking) return;
    setPendingAction(null);
    setError(null);
    setDeleteEmailInput('');
  };

  const handleResetSettings = () => {
    for (const key of settingsLayoutStorageKeys('customer')) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // best-effort only
      }
    }
    setPendingAction(null);
    setResetDone(true);
  };

  const handleDeactivate = async () => {
    if (!user?.id || !accessToken) return;

    setIsWorking(true);
    setError(null);

    const result = await deactivateCustomer(user.id, accessToken);

    if (result.error) {
      setIsWorking(false);
      setError(result.error);
      return;
    }

    // "Logs the user out immediately" - don't wait for anything else.
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleDelete = async () => {
    if (!user?.id || !accessToken || !isDeleteConfirmationValid) return;

    setIsWorking(true);
    setError(null);

    const result = await deleteOwnAccount(user.id, accessToken);

    if (result.error) {
      setIsWorking(false);
      setError(result.error);
      return;
    }

    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Reset settings</h2>
        <p className={styles.copy}>
          Clears this Settings page's own layout - section order, sort mode,
          and sidebar width - back to their defaults. Doesn't change your
          password, appearance, or notification preferences.
        </p>
        {resetDone ? (
          <p className={styles.successBanner}>Settings reset to default.</p>
        ) : null}
        <button
          className={styles.button}
          type="button"
          onClick={() => {
            setResetDone(false);
            setPendingAction('reset');
          }}
        >
          Reset settings to default
        </button>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Deactivate account</h2>
        <p className={styles.copy}>
          Signs you out immediately. Log back in any time before your account
          is automatically deleted to reactivate it instead.
        </p>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={() => setPendingAction('deactivate')}
        >
          Deactivate account
        </button>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Delete account</h2>
        <p className={styles.copy}>
          Permanently removes your account. If you have booking or payment
          history, we keep those records for our business purposes but
          permanently remove your personal details; otherwise your account is
          deleted outright. This cannot be undone.
        </p>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={() => setPendingAction('delete')}
        >
          Delete account
        </button>
      </section>

      <ConfirmDialog
        isOpen={pendingAction === 'reset'}
        title="Reset settings to default?"
        body="This only affects this Settings page's own layout, not your account."
        confirmLabel="Reset"
        isConfirming={false}
        onCancel={closeDialog}
        onConfirm={handleResetSettings}
      />

      <ConfirmDialog
        isOpen={pendingAction === 'deactivate'}
        title="Deactivate your account?"
        tone="danger"
        body={
          <>
            <p>
              You'll be signed out right away. Log back in before the
              automatic deletion window passes to reactivate.
            </p>
            {error ? (
              <p className={styles.errorBanner} role="alert">
                {error}
              </p>
            ) : null}
          </>
        }
        confirmLabel="Yes, deactivate"
        cancelLabel="Keep my account"
        isConfirming={isWorking}
        onCancel={closeDialog}
        onConfirm={() => void handleDeactivate()}
      />

      <ConfirmDialog
        isOpen={pendingAction === 'delete'}
        title="Delete your account?"
        tone="danger"
        body={
          <>
            <p>This cannot be undone.</p>
            <label className={styles.field}>
              <span className={styles.copy}>
                Type <strong>{accountEmail}</strong> to confirm
              </span>
              <input
                className={styles.input}
                type="email"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={deleteEmailInput}
                disabled={isWorking}
                onChange={(event) => setDeleteEmailInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && isDeleteConfirmationValid) {
                    event.preventDefault();
                    void handleDelete();
                  }
                }}
              />
            </label>
            {error ? (
              <p className={styles.errorBanner} role="alert">
                {error}
              </p>
            ) : null}
          </>
        }
        confirmLabel="Yes, delete my account"
        cancelLabel="Keep my account"
        isConfirming={isWorking}
        confirmDisabled={!isDeleteConfirmationValid}
        onCancel={closeDialog}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
