import { useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import styles from './StorePoliciesModal.module.css';

interface StorePoliciesModalProps {
  onClose: () => void;
  onAgree: () => void;
}

/**
 * Shown by CustomerBookingFlowPage every time a customer leaves the Branch
 * step - they must tick the agreement before continuing to the Pet step.
 * Rendered only while open (the page mounts/unmounts it), so the checkbox
 * starts unticked on every showing.
 */
export function StorePoliciesModal({
  onClose,
  onAgree,
}: StorePoliciesModalProps) {
  const [hasAgreed, setHasAgreed] = useState(false);

  return (
    <Modal isOpen title="Store policies" onClose={onClose}>
      {/* Policy text goes here - intentionally empty until it's supplied. */}
      <div className={styles.policies} />

      <label className={styles.agreeRow}>
        <input
          type="checkbox"
          checked={hasAgreed}
          onChange={(event) => setHasAgreed(event.target.checked)}
        />
        I have read and agree to the store policies
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.continueButton}
          disabled={!hasAgreed}
          onClick={onAgree}
        >
          Continue
        </button>
      </div>
    </Modal>
  );
}
