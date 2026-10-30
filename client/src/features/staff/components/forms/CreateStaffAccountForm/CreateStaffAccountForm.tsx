import { useState, type FormEvent } from 'react';
import { StaffNameFields } from '../StaffNameFields/StaffNameFields';
import {
  EMPTY_STAFF_NAME,
  type StaffNameValues,
} from '../../../utils/staffName';
import { createStaffAccount } from '../../../api/staff.api';
import type { BranchSummary } from '../../../../maintenance/maintenance.types';
import type { CreateStaffAccountResult, StaffRole } from '../../../staff.types';
import { ResendEmailButton } from '../../buttons/ResendEmailButton/ResendEmailButton';
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
  'Front Desk',
];

interface CreateStaffAccountFormProps {
  accessToken: string;
  /** Admin and Superadmin may create at either branch (Issue #73 full parity). */
  viewerRole: StaffRole;
  viewerBranchId: string;
  /** Every real branch, not just ones with staff already visible to the
   * viewer - an Admin's own GET /staff is branch-scoped, so deriving options
   * from the staff list would only ever offer their own branch back. */
  branches: BranchSummary[];
  onCreated: (result: CreateStaffAccountResult) => void;
}

/**
 * Implements M01 Process 1 (Admin Creates a Staff Account). The server now
 * emails the account_created credentials via Brevo (Issue #74) and still
 * returns the temporary password directly in the response as a fallback the
 * admin can relay by hand - this form surfaces both, plus a resend action in
 * case the email didn't arrive.
 */
export function CreateStaffAccountForm({
  accessToken,
  viewerRole,
  viewerBranchId,
  branches,
  onCreated,
}: CreateStaffAccountFormProps) {
  const [username, setUsername] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  // Staff names (20261030290): legal name + optional nickname - the name
  // shown around the app is derived from them.
  const [name, setName] = useState<StaffNameValues>(EMPTY_STAFF_NAME);
  const [role, setRole] = useState<StaffRole>(ALL_ROLES[3]);
  const [branchId, setBranchId] = useState(viewerBranchId);
  const [error, setError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] =
    useState<CreateStaffAccountResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Issue #73: Admin has full branch-assignment parity with Superadmin, not
  // just same-branch parity - both may pick either branch on creation.
  const canPickBranch = viewerRole === 'Admin' || viewerRole === 'Superadmin';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !username.trim() ||
      !registeredEmail.trim() ||
      !name.first_name.trim() ||
      !name.last_name.trim()
    ) {
      setError(
        'Username, registered email, first name and last name are required.'
      );
      return;
    }

    setError(null);
    setCreatedAccount(null);
    setIsSubmitting(true);

    const result = await createStaffAccount(accessToken, {
      username: username.trim(),
      registered_email: registeredEmail.trim(),
      first_name: name.first_name.trim(),
      middle_name: name.middle_name.trim() || null,
      last_name: name.last_name.trim(),
      nickname: name.nickname.trim() || null,
      role,
      branch_id: canPickBranch ? branchId : viewerBranchId,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not create staff account.');
      return;
    }

    setCreatedAccount(result.data);
    setUsername('');
    setRegisteredEmail('');
    setName(EMPTY_STAFF_NAME);
    setRole(ALL_ROLES[3]);
    onCreated(result.data);
  };

  return (
    <div className={styles.wrapper}>
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
        <label className={styles.field}>
          <span className={styles.label}>Registered email</span>
          <input
            className={styles.input}
            type="email"
            value={registeredEmail}
            onChange={(event) => setRegisteredEmail(event.target.value)}
          />
        </label>
        <StaffNameFields
          value={name}
          onChange={setName}
          fieldClassName={styles.field}
          labelClassName={styles.label}
          inputClassName={styles.input}
          hintClassName={styles.hint}
        />
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
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
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

      {createdAccount ? (
        <div className={styles.successBanner}>
          <p>
            Account created. A credential email has been sent to the new hire;
            the temporary password is also shown here as a fallback:{' '}
            <code>{createdAccount.temporary_password}</code>
          </p>
          <ResendEmailButton
            staffId={createdAccount.staff.id}
            accessToken={accessToken}
          />
        </div>
      ) : null}
    </div>
  );
}
