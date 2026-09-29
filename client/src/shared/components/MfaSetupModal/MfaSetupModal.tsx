import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import { MfaMethodEnrollFlow } from '../MfaMethodEnrollFlow/MfaMethodEnrollFlow';
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
        {/* Only ever shown for a mandatory-MFA role (see StaffAuthGuard) - their
            bedrock factor must always be a real authenticator app, since the
            server never learns that secret (unlike 'email' - see
            mfa_factor_methods' migration comment on why that's a materially
            weaker guarantee for the highest-privilege roles). Skips the
            method choice entirely rather than letting them pick 'email' as
            their only factor. */}
        <MfaMethodEnrollFlow
          role={role}
          accessToken={accessToken}
          onEnrolled={onEnrolled}
          initialMethod="authenticator"
        />
      </section>
    </div>
  );
}
