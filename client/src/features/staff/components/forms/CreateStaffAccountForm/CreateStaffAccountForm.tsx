import { useState, type FormEvent } from 'react';
import { createStaffAccount } from '../../../api/staff.api';
import type { CreateStaffAccountResult, StaffRole } from '../../../staff.types';
import styles from './CreateStaffAccountForm.module.css';

const ALL_ROLES: StaffRole[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

interface CreateStaffAccountFormProps {
  accessToken: string;
  /** Superadmin may create at any branch; everyone else is locked to their own. */
  viewerRole: StaffRole;
  viewerBranchId: string;
  branchOptions: string[];
  onCreated: (result: CreateStaffAccountResult) => void;
}

/**
 * Implements M01 Process 1 (Admin Creates a Staff Account). There is no
 * notification/email infrastructure yet (M11 is Sprint 6), so the server
 * returns the generated temporary password directly in the response - this
 * form surfaces it so the admin can relay it to the new hire.
 */
export function CreateStaffAccountForm({
  accessToken,
  viewerRole,
  viewerBranchId,
  branchOptions,
  onCreated,
}: CreateStaffAccountFormProps) {
  const [username, setUsername] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<StaffRole>(ALL_ROLES[3]);
  const [branchId, setBranchId] = useState(viewerBranchId);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canPickBranch = viewerRole === 'Superadmin';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !registeredEmail.trim() || !displayName.trim()) {
      setError('Username, registered email, and display name are required.');
      return;
    }

    setError(null);
    setTemporaryPassword(null);
    setIsSubmitting(true);

    const result = await createStaffAccount(accessToken, {
      username: username.trim(),
      registered_email: registeredEmail.trim(),
      display_name: displayName.trim(),
      role,
      branch_id: canPickBranch ? branchId : viewerBranchId,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not create staff account.');
      return;
    }

    setTemporaryPassword(result.data.temporary_password);
    setUsername('');
    setRegisteredEmail('');
    setDisplayName('');
    setRole(ALL_ROLES[3]);
    onCreated(result.data);
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.field}>
          <span className={styles.label}>Username</span>
          <input
            className={styles.input}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Registered email</span>
          <input
            className={styles.input}
            type="email"
            value={registeredEmail}
            onChange={(event) => setRegisteredEmail(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Display name</span>
          <input
            className={styles.input}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>New hire role</span>
          <select
            className={styles.input}
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
          >
            {ALL_ROLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {canPickBranch ? (
          <label className={styles.field}>
            <span className={styles.label}>New hire branch</span>
            <select
              className={styles.input}
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              {branchOptions.map((option) => (
                <option key={option} value={option}>
                  {`Branch ${option.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create staff account'}
        </button>
      </form>

      {temporaryPassword ? (
        <p className={styles.successBanner}>
          Account created. Temporary password (relay this to the new hire -
          there is no automated account_created email yet): <code>{temporaryPassword}</code>
        </p>
      ) : null}
    </div>
  );
}
