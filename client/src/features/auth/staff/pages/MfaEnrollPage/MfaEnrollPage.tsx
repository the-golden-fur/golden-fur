import { MfaEnrollForm } from '../../components/forms/MfaEnrollForm/MfaEnrollForm';
import styles from '../StaffLoginPage/StaffLoginPage.module.css';

export function MfaEnrollPage() {
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
        <MfaEnrollForm />
      </section>
    </main>
  );
}
