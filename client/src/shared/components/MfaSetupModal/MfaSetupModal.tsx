import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { TotpEnrollPanel } from '../TotpEnrollPanel/TotpEnrollPanel';
import styles from './MfaSetupModal.module.css';

interface MfaSetupModalProps {
  isOpen: boolean;
  role: ThemeRole;
  accessToken: string;
  onEnrolled: () => void;
}

export function MfaSetupModal({
  isOpen,
  role,
  accessToken,
  onEnrolled,
}: MfaSetupModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      aria-label="Multi-factor authentication setup required"
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-setup-title"
      >
        <p className={styles.eyebrow}>Security requirement</p>
        <h2 id="mfa-setup-title" className={styles.title}>
          Set up multi-factor authentication
        </h2>
        <TotpEnrollPanel
          role={role}
          accessToken={accessToken}
          onEnrolled={onEnrolled}
        />
      </section>
    </div>
  );
}
