import { useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { PolicyConfigurationPage } from '../../../booking/pages/PolicyConfigurationPage/PolicyConfigurationPage';
import { updateBranch } from '../../api/branches.api';
import type { Branch } from '../../maintenance.types';
import {
  BranchDetailsForm,
  type BranchDetailsPayload,
} from '../BranchDetailsForm/BranchDetailsForm';
import styles from './BranchConfigureModal.module.css';

interface BranchConfigureModalProps {
  /** The branch being configured, or null while the modal is closed. */
  branch: Branch | null;
  onClose: () => void;
  /** Called with the saved branch so the list behind the modal updates. */
  onSaved: (branch: Branch) => void;
}

/**
 * Branches > "..." > Configure: ONE modal covering the branch's own details
 * (name, address, contact, timezone, vet flag, operating hours) and its
 * booking policies. These used to be two separate menu items (Edit / Details
 * and Configure -> Policies). Each half keeps its own Save button since they
 * write to different tables.
 *
 * Closing (the Close button or a click outside) with unsaved edits in the
 * Branch details form asks "Discard unsaved changes?" first, so a stray
 * click can't silently throw them away.
 */
export function BranchConfigureModal({
  branch,
  onClose,
  onSaved,
}: BranchConfigureModalProps) {
  const { accessToken } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [hasUnsavedDetails, setHasUnsavedDetails] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  function closeModal() {
    setIsConfirmingDiscard(false);
    setHasUnsavedDetails(false);
    onClose();
  }

  function requestClose() {
    if (hasUnsavedDetails) {
      setIsConfirmingDiscard(true);
      return;
    }

    closeModal();
  }

  async function handleSaveDetails(
    payload: BranchDetailsPayload
  ): Promise<string | null> {
    if (!accessToken || !branch) return 'You are signed out.';

    const result = await updateBranch(branch.id, accessToken, payload);

    if (result.error || !result.data) {
      setMessage(null);
      return result.error ?? 'Could not update the branch.';
    }

    onSaved(result.data);
    setMessage('Branch details saved.');
    return null;
  }

  return (
    <>
      <Modal
        isOpen={branch !== null}
        title={branch ? `Configure ${branch.name}` : 'Configure branch'}
        onClose={requestClose}
        size="wide"
      >
        {branch ? (
          <div className={styles.sections}>
            <section aria-labelledby="branch-details-heading">
              <h3 className={styles.sectionTitle} id="branch-details-heading">
                Branch details
              </h3>
              {message ? (
                <p className={styles.successBanner} role="status">
                  {message}
                </p>
              ) : null}
              <BranchDetailsForm
                key={branch.id}
                branch={branch}
                submitLabel="Save details"
                onSubmit={handleSaveDetails}
                onDirtyChange={setHasUnsavedDetails}
              />
            </section>

            <section aria-labelledby="branch-policies-heading">
              <h3 className={styles.sectionTitle} id="branch-policies-heading">
                Booking policies
              </h3>
              <PolicyConfigurationPage
                embedded
                initialBranchId={branch.id}
                lockBranchSelector
              />
            </section>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        isOpen={isConfirmingDiscard}
        title="Discard unsaved changes?"
        body="You have changes to this branch's details that haven't been saved. Closing now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={closeModal}
        onCancel={() => setIsConfirmingDiscard(false)}
      />
    </>
  );
}
