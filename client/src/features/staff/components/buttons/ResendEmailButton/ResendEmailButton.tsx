import { useState } from 'react';
import { resendAccountEmail } from '../../../api/staff.api';
import styles from './ResendEmailButton.module.css';

interface ResendEmailButtonProps {
  staffId: string;
  accessToken: string;
}

/**
 * Issue #74: lets an Admin/Superadmin re-send a staff member's
 * account_created credential email if the original didn't arrive. Reachable
 * from both the staff-creation confirmation screen (CreateStaffAccountForm)
 * and an existing staff member's profile card (StaffCard), per #75 AC-4.
 */
export function ResendEmailButton({
  staffId,
  accessToken,
}: ResendEmailButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus('sending');
    setError(null);

    const result = await resendAccountEmail(staffId, accessToken);

    if (result.error) {
      setStatus('error');
      setError(result.error);
      return;
    }

    setStatus('sent');
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        disabled={status === 'sending'}
        onClick={() => void handleClick()}
      >
        {status === 'sending' ? 'Resending...' : 'Resend account email'}
      </button>
      {status === 'sent' ? (
        <p className={styles.successBanner}>Account email resent.</p>
      ) : null}
      {status === 'error' && error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
