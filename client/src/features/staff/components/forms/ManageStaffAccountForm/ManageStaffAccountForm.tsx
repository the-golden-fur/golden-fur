import { useState } from 'react';
import { manageStaffAccount } from '../../../api/staff.api';
import type { BranchSummary } from '../../../../maintenance/maintenance.types';
import type { StaffProfile, StaffRole } from '../../../staff.types';
import styles from './ManageStaffAccountForm.module.css';

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

interface ManageStaffAccountFormProps {
  staffId: string;
  profile: StaffProfile;
  /** Only a Superadmin may change role/branch (M01 Process 5). */
  viewerRole: StaffRole;
  /** Every real branch, loaded by the caller (see StaffManagementPage). */
  branches: BranchSummary[];
  accessToken: string;
  onUpdated: (updated: StaffProfile) => void;
}

export function ManageStaffAccountForm({
  staffId,
  profile,
  viewerRole,
  branches,
  accessToken,
  onUpdated,
}: ManageStaffAccountFormProps) {
  const [role, setRole] = useState<StaffRole>(profile.role);
  const [branchId, setBranchId] = useState(profile.branch_id);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canChangeRoleOrBranch = viewerRole === 'Superadmin';

  const applyUpdate = async (
    payload: Parameters<typeof manageStaffAccount>[2],
    successMessage: string
  ) => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    const result = await manageStaffAccount(staffId, accessToken, payload);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not update this staff account.');
      return;
    }

    setMessage(successMessage);
    onUpdated(result.data);
  };

  const handleSaveRoleAndBranch = () => {
    const payload: { role?: StaffRole; branch_id?: string } = {};

    if (role !== profile.role) {
      payload.role = role;
    }

    if (branchId !== profile.branch_id) {
      payload.branch_id = branchId;
    }

    if (Object.keys(payload).length === 0) {
      setError('No changes to save.');
      return;
    }

    void applyUpdate(payload, 'Role/branch updated.');
  };

  const handleToggleActive = () => {
    void applyUpdate(
      { is_active: !profile.is_active },
      profile.is_active ? 'Account deactivated.' : 'Account reactivated.'
    );
  };

  return (
    <div className={styles.wrapper}>
      {canChangeRoleOrBranch ? (
        <div className={styles.roleBranchFields}>
          <label className={styles.field}>
            <span className={styles.label}>Change role to</span>
            <select
              className={styles.select}
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
          <label className={styles.field}>
            <span className={styles.label}>Change branch to</span>
            <select
              className={styles.select}
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
          <button
            type="button"
            className={styles.button}
            disabled={isSubmitting}
            onClick={handleSaveRoleAndBranch}
          >
            {isSubmitting ? 'Saving...' : 'Save role/branch'}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={
          profile.is_active ? styles.deactivateButton : styles.reactivateButton
        }
        disabled={isSubmitting}
        onClick={handleToggleActive}
      >
        {isSubmitting
          ? 'Saving...'
          : profile.is_active
            ? 'Deactivate account'
            : 'Reactivate account'}
      </button>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className={styles.success}>{message}</p> : null}
    </div>
  );
}
