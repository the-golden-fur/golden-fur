import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { TotpEnrollPanel } from '../../../../../shared/components/TotpEnrollPanel/TotpEnrollPanel';
import styles from '../StaffLoginPage/StaffLoginPage.module.css';

export function MfaEnrollPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="mfa-enroll-title">
        <div>
          <h1 className={styles.title} id="mfa-enroll-title">
            Set Up MFA
          </h1>
          <p className={styles.copy}>
            Scan the QR code, then enter the 6-digit code from your
            authenticator app.
          </p>
        </div>
        {accessToken ? (
          <TotpEnrollPanel
            role="staff"
            accessToken={accessToken}
            onEnrolled={() => {
              window.sessionStorage.removeItem('staffMfaPending');
              navigate('/staff', { replace: true });
            }}
          />
        ) : null}
      </section>
    </main>
  );
}
